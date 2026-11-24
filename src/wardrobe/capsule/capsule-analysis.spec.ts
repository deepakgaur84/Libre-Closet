import {
  analyzeCapsule,
  classifyColors,
  enumerateOutfits,
  outfitKey,
  parseColors,
  pickDiverseOutfits,
  AnalysisGarment,
} from './capsule-analysis';
import { CAPSULE_TEMPLATES, getCapsuleTemplate } from './capsule-templates';

let nextId = 1;
const g = (category: string, color?: string): AnalysisGarment => ({
  id: nextId++,
  category,
  color,
});

const rules = {
  quotas: { tops: 2, bottoms: 2, footwear: 1 },
  targetSize: 5,
  neutralTarget: 70,
};

describe('capsule-analysis', () => {
  beforeEach(() => {
    nextId = 1;
  });

  describe('colours', () => {
    it('parses comma separated colours', () => {
      expect(parseColors(' Navy, WHITE ,')).toEqual(['navy', 'white']);
      expect(parseColors(undefined)).toEqual([]);
    });

    it('classifies neutral, accent and unclassified', () => {
      expect(classifyColors(['black', 'white'])).toBe('neutral');
      expect(classifyColors(['black', 'red'])).toBe('accent');
      expect(classifyColors(['pattern'])).toBe('accent');
      expect(classifyColors([])).toBe('unclassified');
    });
  });

  describe('outfits', () => {
    it('counts top x bottom x shoes, with an optional layer', () => {
      const pieces = [
        g('tops', 'white'),
        g('tops', 'blue'),
        g('bottoms', 'black'),
        g('footwear', 'brown'),
        g('outerwear', 'grey'),
      ];
      // 2 tops x 1 bottom x 1 shoe x (no layer + 1 layer)
      expect(analyzeCapsule(pieces, rules).outfitCount).toBe(4);
      expect(enumerateOutfits(pieces)).toHaveLength(4);
    });

    it('is zero without shoes or without a top and bottom', () => {
      expect(
        analyzeCapsule([g('tops', 'white'), g('bottoms', 'black')], rules)
          .outfitCount,
      ).toBe(0);
      expect(
        analyzeCapsule([g('tops', 'white'), g('footwear', 'black')], rules)
          .outfitCount,
      ).toBe(0);
    });

    it('treats a dress as a full outfit with shoes', () => {
      const pieces = [g('dresses', 'red'), g('footwear', 'black')];
      expect(analyzeCapsule(pieces, rules).outfitCount).toBe(1);
    });

    it('rejects outfits with more than two accent colours or two patterns', () => {
      const clash = [
        g('tops', 'red'),
        g('bottoms', 'green'),
        g('footwear', 'purple'),
      ];
      expect(analyzeCapsule(clash, rules).outfitCount).toBe(0);

      const patterns = [
        g('tops', 'pattern'),
        g('bottoms', 'pattern'),
        g('footwear', 'black'),
      ];
      expect(analyzeCapsule(patterns, rules).outfitCount).toBe(0);
    });

    it('matches categories case-insensitively', () => {
      const pieces = [
        g('Tops', 'white'),
        g('BOTTOMS', 'black'),
        g('Footwear', 'black'),
      ];
      expect(analyzeCapsule(pieces, rules).outfitCount).toBe(1);
    });

    it('flags a piece that never works with the rest as weak', () => {
      const clashing = g('tops', 'red,orange,yellow');
      const pieces = [
        g('tops', 'white'),
        g('tops', 'grey'),
        clashing,
        g('bottoms', 'black'),
        g('footwear', 'black'),
      ];
      const result = analyzeCapsule(pieces, rules);
      expect(result.usage[clashing.id]).toBe(0);
      expect(result.weakGarmentIds).toContain(clashing.id);
    });

    it('stops enumerating at the limit', () => {
      const pieces = [
        g('tops', 'white'),
        g('tops', 'grey'),
        g('bottoms', 'black'),
        g('footwear', 'black'),
      ];
      expect(enumerateOutfits(pieces, 1)).toHaveLength(1);
    });
  });

  describe('quotas and gaps', () => {
    it('reports short, over and unplanned categories', () => {
      const pieces = [
        g('tops', 'white'),
        g('tops', 'grey'),
        g('tops', 'black'),
        g('bags', 'brown'),
      ];
      const { categories } = analyzeCapsule(pieces, rules);
      const status = Object.fromEntries(
        categories.map((c) => [c.category, c.status]),
      );
      expect(status).toEqual({
        tops: 'over',
        bottoms: 'short',
        footwear: 'short',
        bags: 'unplanned',
      });
    });

    it('lists missing core categories and over-size capsules', () => {
      const result = analyzeCapsule([g('tops', 'white'), g('tops', 'grey')], {
        ...rules,
        targetSize: 1,
      });
      const codes = result.gaps.map((x) => x.code);
      expect(codes).toContain('MISSING_CORE');
      expect(codes).toContain('OVER_TOTAL');
    });

    it('asks for more neutrals when the capsule is too colourful', () => {
      const pieces = [
        g('tops', 'red'),
        g('tops', 'green'),
        g('bottoms', 'purple'),
        g('footwear', 'black'),
      ];
      const result = analyzeCapsule(pieces, rules);
      expect(result.colors.neutralPercent).toBe(25);
      expect(result.gaps.map((x) => x.code)).toContain('NEEDS_NEUTRALS');
      expect(result.gaps).toContainEqual({
        code: 'NO_NEUTRAL_IN',
        category: 'tops',
      });
    });

    it('has no gaps for a balanced, complete capsule', () => {
      const pieces = [
        g('tops', 'white'),
        g('tops', 'navy'),
        g('bottoms', 'black'),
        g('bottoms', 'khaki'),
        g('footwear', 'brown'),
      ];
      expect(analyzeCapsule(pieces, rules).gaps).toEqual([]);
    });
  });

  describe('generation helpers', () => {
    it('builds an order independent outfit key', () => {
      expect(outfitKey([3, 1, 2])).toBe(outfitKey([2, 3, 1]));
    });

    it('picks varied outfits first', () => {
      const candidates = [
        [1, 10],
        [1, 11],
        [2, 12],
        [3, 13],
      ];
      const picked = pickDiverseOutfits(candidates, 3);
      expect(picked).toHaveLength(3);
      // the first two picks must not both reuse piece 1
      const firstTwo = picked.slice(0, 2).flat();
      expect(firstTwo.filter((id) => id === 1).length).toBeLessThanOrEqual(1);
    });

    it('never returns more outfits than exist', () => {
      expect(pickDiverseOutfits([[1, 2]], 5)).toHaveLength(1);
    });
  });

  describe('templates', () => {
    it('defaults to the men template for unknown keys', () => {
      expect(getCapsuleTemplate(undefined).key).toBe('men');
      expect(getCapsuleTemplate('nope').key).toBe('men');
    });

    it("men's quotas add up to the target size", () => {
      const men = CAPSULE_TEMPLATES.men;
      const sum = Object.values(men.quotas).reduce((a, b) => a + b, 0);
      expect(sum).toBe(men.targetSize);
    });
  });
});
