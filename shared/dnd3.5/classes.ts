export const HIT_DIE_VALUES = [4, 6, 8, 10, 12] as const;

export type HitDieValue = (typeof HIT_DIE_VALUES)[number];

export const isHitDie = (value: number | null | undefined): value is HitDieValue =>
  (HIT_DIE_VALUES as readonly (number | null | undefined)[]).includes(value);
