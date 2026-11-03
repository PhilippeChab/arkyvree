/**
 * A creature's size, and the numbers its rules read of it: its modifiers to AC and attack, grapple and Hide, and its
 * weapons' damage step.
 */

/** A creature's or a weapon's size. */
export type SizeType = (typeof SIZE_OPTIONS)[number];

/** Size modifier applied to AC and to-hit (same magnitude, same direction). */
export const SIZE_AC_ATTACK_MOD: Record<string, number> = {
  Fine: 8,
  Diminutive: 4,
  Tiny: 2,
  Small: 1,
  Medium: 0,
  Large: -1,
  Huge: -2,
  Gargantuan: -4,
  Colossal: -8,
};

/** Size modifier applied to grapple checks (opposite direction to AC/attack). */
export const SIZE_GRAPPLE_MOD: Record<string, number> = {
  Fine: -16,
  Diminutive: -12,
  Tiny: -8,
  Small: -4,
  Medium: 0,
  Large: 4,
  Huge: 8,
  Gargantuan: 12,
  Colossal: 16,
};

/** Size modifier applied to the Hide skill (opposite direction to AC/attack). */
export const SIZE_HIDE_MOD: Record<string, number> = {
  Fine: 16,
  Diminutive: 12,
  Tiny: 8,
  Small: 4,
  Medium: 0,
  Large: -4,
  Huge: -8,
  Gargantuan: -12,
  Colossal: -16,
};

/** Every size, smallest first. */
export const SIZE_OPTIONS = [
  "Fine",
  "Diminutive",
  "Tiny",
  "Small",
  "Medium",
  "Large",
  "Huge",
  "Gargantuan",
  "Colossal",
] as const;

/** Weapon damage size step (Medium = 0; +1 step = bigger damage die). */
export const SIZE_STEPS: Record<string, number> = {
  Fine: -4,
  Diminutive: -3,
  Tiny: -2,
  Small: -1,
  Medium: 0,
  Large: 1,
  Huge: 2,
  Gargantuan: 3,
  Colossal: 4,
};
