export const HIT_DIE_VALUES = [4, 6, 8, 10, 12] as const;

export type HitDieValue = (typeof HIT_DIE_VALUES)[number];
