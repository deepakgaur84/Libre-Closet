/**
 * Pure (database free) capsule wardrobe maths: quota progress, colour balance,
 * how many outfits the pieces can form, weak links and gaps.
 */

export interface AnalysisGarment {
  id: number;
  category: string;
  /** Raw comma separated colour string as stored on a garment. */
  color?: string | null;
}

export interface CapsuleRules {
  /** category (any case) -> wanted number of pieces */
  quotas: Record<string, number>;
  targetSize: number;
  /** wanted percentage (0-100) of neutral pieces */
  neutralTarget: number;
}

/**
 * Colours that go with almost everything. "blue" is included because navy and
 * denim are the staples of most capsule wardrobes; custom colours such as
 * "navy", "olive" or "charcoal" are recognised as well.
 */
export const NEUTRAL_COLORS: ReadonlySet<string> = new Set([
  'black',
  'white',
  'grey',
  'gray',
  'beige',
  'brown',
  'silver',
  'blue',
  'navy',
  'charcoal',
  'cream',
  'ivory',
  'tan',
  'khaki',
  'olive',
  'stone',
  'taupe',
  'camel',
  'denim',
  'off-white',
  'offwhite',
]);

export const CORE_TOP = 'tops';
export const CORE_BOTTOM = 'bottoms';
export const CORE_SHOE = 'footwear';
export const LAYER = 'outerwear';
export const DRESS = 'dresses';

/** An outfit is only considered "wearable" with at most this many accents. */
export const MAX_ACCENT_COLORS_PER_OUTFIT = 2;
export const MAX_PATTERNS_PER_OUTFIT = 1;
/** Safety cap for how many outfit combinations are materialised. */
export const MAX_ENUMERATED_OUTFITS = 20000;

export type ColorClass = 'neutral' | 'accent' | 'unclassified';

export function normalizeCategory(category: string | null | undefined) {
  return (category ?? '').trim().toLowerCase();
}

export function parseColors(color?: string | null): string[] {
  if (!color) return [];
  return color
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c.length > 0);
}

export function classifyColors(colors: string[]): ColorClass {
  if (colors.length === 0) return 'unclassified';
  return colors.every((c) => NEUTRAL_COLORS.has(c)) ? 'neutral' : 'accent';
}

/** The non-neutral colour "tokens" a garment contributes to an outfit. */
function accentTokens(colors: string[]): string[] {
  return colors.filter((c) => !NEUTRAL_COLORS.has(c));
}

export type CapsuleGap =
  | { code: 'MISSING_CORE'; category: string }
  | { code: 'SHORT'; category: string; count: number }
  | { code: 'OVER'; category: string; count: number }
  | { code: 'OVER_TOTAL'; count: number }
  | { code: 'NEEDS_NEUTRALS'; percent: number; target: number }
  | { code: 'NO_NEUTRAL_IN'; category: string };

export interface CategoryProgress {
  category: string;
  count: number;
  quota: number;
  status: 'ok' | 'short' | 'over' | 'unplanned';
}

export interface CapsuleAnalysis {
  total: number;
  targetSize: number;
  categories: CategoryProgress[];
  colors: {
    neutral: number;
    accent: number;
    unclassified: number;
    /** share of neutral pieces among colour-tagged pieces, null if none */
    neutralPercent: number | null;
    accentPercent: number | null;
  };
  /** number of wearable outfits (top + bottom + shoes [+ layer], or dress) */
  outfitCount: number;
  /** garment id -> number of wearable outfits it appears in */
  usage: Record<number, number>;
  /** garment ids that are rarely (or never) part of a wearable outfit */
  weakGarmentIds: number[];
  gaps: CapsuleGap[];
}

interface Prepared {
  garment: AnalysisGarment;
  category: string;
  colors: string[];
  cls: ColorClass;
  accents: string[];
}

function prepare(garments: AnalysisGarment[]): Prepared[] {
  return garments.map((garment) => {
    const colors = parseColors(garment.color);
    return {
      garment,
      category: normalizeCategory(garment.category),
      colors,
      cls: classifyColors(colors),
      accents: accentTokens(colors),
    };
  });
}

function outfitIsWearable(pieces: Prepared[]): boolean {
  const accents = new Set<string>();
  let patterns = 0;
  for (const p of pieces) {
    for (const a of p.accents) accents.add(a);
    if (p.colors.includes('pattern')) patterns++;
  }
  return (
    accents.size <= MAX_ACCENT_COLORS_PER_OUTFIT &&
    patterns <= MAX_PATTERNS_PER_OUTFIT
  );
}

/**
 * Walks every top/bottom/shoes(/layer) and dress/shoes(/layer) combination.
 * `visit` is called for each wearable one. Returns nothing; callers collect.
 */
function walkOutfits(
  garments: Prepared[],
  visit: (ids: number[]) => void,
): void {
  const by = (cat: string) => garments.filter((g) => g.category === cat);
  const tops = by(CORE_TOP);
  const bottoms = by(CORE_BOTTOM);
  const shoes = by(CORE_SHOE);
  const dresses = by(DRESS);
  // `null` stands for "no outer layer"
  const layers: (Prepared | null)[] = [null, ...by(LAYER)];

  if (shoes.length === 0) return;

  const emit = (base: Prepared[]) => {
    for (const shoe of shoes) {
      for (const layer of layers) {
        const pieces = layer ? [...base, shoe, layer] : [...base, shoe];
        if (outfitIsWearable(pieces)) {
          visit(pieces.map((p) => p.garment.id));
        }
      }
    }
  };

  for (const top of tops) {
    for (const bottom of bottoms) emit([top, bottom]);
  }
  for (const dress of dresses) emit([dress]);
}

/** Every wearable outfit (list of garment ids), capped for safety. */
export function enumerateOutfits(
  garments: AnalysisGarment[],
  limit = MAX_ENUMERATED_OUTFITS,
): number[][] {
  const result: number[][] = [];
  try {
    walkOutfits(prepare(garments), (ids) => {
      if (result.length >= limit) throw new StopWalking();
      result.push(ids);
    });
  } catch (e) {
    if (!(e instanceof StopWalking)) throw e;
  }
  return result;
}

class StopWalking extends Error {}

/**
 * Greedily picks `count` outfits so that the least-used pieces are favoured,
 * giving a varied set instead of ten outfits that only swap one sock.
 */
export function pickDiverseOutfits(
  candidates: number[][],
  count: number,
): number[][] {
  const remaining = [...candidates];
  const picked: number[][] = [];
  const used = new Map<number, number>();
  while (picked.length < count && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      let score = 0;
      for (const id of remaining[i]) score += used.get(id) ?? 0;
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
        if (score === 0) break;
      }
    }
    const [chosen] = remaining.splice(bestIdx, 1);
    picked.push(chosen);
    for (const id of chosen) used.set(id, (used.get(id) ?? 0) + 1);
  }
  return picked;
}

/** Stable key for a set of garments, used to avoid duplicate outfits. */
export function outfitKey(ids: number[]): string {
  return [...ids].sort((a, b) => a - b).join('-');
}

export function analyzeCapsule(
  garments: AnalysisGarment[],
  rules: CapsuleRules,
): CapsuleAnalysis {
  const prepared = prepare(garments);

  // ---- quota progress -----------------------------------------------------
  const quotas: Record<string, number> = {};
  for (const [cat, q] of Object.entries(rules.quotas ?? {})) {
    const key = normalizeCategory(cat);
    if (key) quotas[key] = (quotas[key] ?? 0) + Math.max(0, Math.floor(q || 0));
  }
  const counts: Record<string, number> = {};
  for (const p of prepared) counts[p.category] = (counts[p.category] ?? 0) + 1;

  const orderedKeys = [
    ...Object.keys(quotas),
    ...Object.keys(counts)
      .filter((c) => !(c in quotas))
      .sort(),
  ];
  const categories: CategoryProgress[] = orderedKeys.map((category) => {
    const count = counts[category] ?? 0;
    const quota = quotas[category] ?? 0;
    let status: CategoryProgress['status'] = 'ok';
    if (!(category in quotas)) status = 'unplanned';
    else if (count < quota) status = 'short';
    else if (count > quota) status = 'over';
    return { category, count, quota, status };
  });

  // ---- colour balance -----------------------------------------------------
  const neutral = prepared.filter((p) => p.cls === 'neutral').length;
  const accent = prepared.filter((p) => p.cls === 'accent').length;
  const unclassified = prepared.length - neutral - accent;
  const classified = neutral + accent;
  const neutralPercent =
    classified > 0 ? Math.round((neutral / classified) * 100) : null;
  const accentPercent = neutralPercent === null ? null : 100 - neutralPercent;

  // ---- outfits and per-piece usage ---------------------------------------
  const usage: Record<number, number> = {};
  for (const p of prepared) usage[p.garment.id] = 0;
  let outfitCount = 0;
  walkOutfits(prepared, (ids) => {
    outfitCount++;
    for (const id of ids) usage[id] = (usage[id] ?? 0) + 1;
  });

  const weakGarmentIds: number[] = [];
  if (outfitCount > 0) {
    const roleCats = [CORE_TOP, CORE_BOTTOM, CORE_SHOE, LAYER, DRESS];
    for (const cat of roleCats) {
      const members = prepared.filter((p) => p.category === cat);
      if (members.length < 2) continue;
      const avg =
        members.reduce((sum, m) => sum + usage[m.garment.id], 0) /
        members.length;
      for (const m of members) {
        const u = usage[m.garment.id];
        if (u === 0 || u < avg * 0.5) weakGarmentIds.push(m.garment.id);
      }
    }
  }

  // ---- gaps ---------------------------------------------------------------
  const gaps: CapsuleGap[] = [];
  const hasDresses = (counts[DRESS] ?? 0) > 0;
  for (const core of [CORE_TOP, CORE_BOTTOM, CORE_SHOE]) {
    const wanted = (quotas[core] ?? 0) > 0 || prepared.length > 0;
    const skipBecauseDresses =
      hasDresses && (core === CORE_TOP || core === CORE_BOTTOM);
    if (wanted && (counts[core] ?? 0) === 0 && !skipBecauseDresses) {
      gaps.push({ code: 'MISSING_CORE', category: core });
    }
  }
  for (const c of categories) {
    if (c.status === 'short') {
      if (
        c.count === 0 &&
        [CORE_TOP, CORE_BOTTOM, CORE_SHOE].includes(c.category)
      ) {
        continue; // already reported as MISSING_CORE
      }
      gaps.push({
        code: 'SHORT',
        category: c.category,
        count: c.quota - c.count,
      });
    } else if (c.status === 'over') {
      gaps.push({
        code: 'OVER',
        category: c.category,
        count: c.count - c.quota,
      });
    }
  }
  if (rules.targetSize > 0 && prepared.length > rules.targetSize) {
    gaps.push({
      code: 'OVER_TOTAL',
      count: prepared.length - rules.targetSize,
    });
  }
  if (
    neutralPercent !== null &&
    classified >= 4 &&
    neutralPercent < rules.neutralTarget - 10
  ) {
    gaps.push({
      code: 'NEEDS_NEUTRALS',
      percent: neutralPercent,
      target: rules.neutralTarget,
    });
  }
  for (const core of [CORE_TOP, CORE_BOTTOM, CORE_SHOE]) {
    const members = prepared.filter((p) => p.category === core);
    if (
      members.length >= 2 &&
      members.every((m) => m.cls === 'accent') // all coloured, none neutral
    ) {
      gaps.push({ code: 'NO_NEUTRAL_IN', category: core });
    }
  }

  return {
    total: prepared.length,
    targetSize: rules.targetSize,
    categories,
    colors: { neutral, accent, unclassified, neutralPercent, accentPercent },
    outfitCount,
    usage,
    weakGarmentIds,
    gaps,
  };
}
