export interface CapsuleTemplate {
  key: string;
  targetSize: number;
  neutralTarget: number;
  /** category (lower-case) -> number of pieces */
  quotas: Record<string, number>;
}

export const DEFAULT_CAPSULE_TEMPLATE = 'men';

/**
 * Starter templates. Quotas are only a starting point; every number can be
 * edited on the capsule's edit page.
 */
export const CAPSULE_TEMPLATES: Record<string, CapsuleTemplate> = {
  // T-shirts, casual shirts, polo, knitwear / jeans, chinos, trousers, shorts
  // / jacket, blazer, coat, shell / sneakers, leather shoes, boots, runners
  men: {
    key: 'men',
    targetSize: 30,
    neutralTarget: 70,
    quotas: {
      tops: 12,
      bottoms: 7,
      outerwear: 4,
      footwear: 4,
      accessories: 3,
    },
  },
  women: {
    key: 'women',
    targetSize: 30,
    neutralTarget: 70,
    quotas: {
      tops: 9,
      bottoms: 5,
      dresses: 3,
      outerwear: 4,
      footwear: 5,
      accessories: 4,
    },
  },
  travel: {
    key: 'travel',
    targetSize: 14,
    neutralTarget: 80,
    quotas: {
      tops: 6,
      bottoms: 3,
      outerwear: 2,
      footwear: 2,
      accessories: 1,
    },
  },
  custom: {
    key: 'custom',
    targetSize: 20,
    neutralTarget: 70,
    quotas: {},
  },
};

export function getCapsuleTemplate(key?: string): CapsuleTemplate {
  return (
    CAPSULE_TEMPLATES[key ?? ''] ?? CAPSULE_TEMPLATES[DEFAULT_CAPSULE_TEMPLATE]
  );
}
