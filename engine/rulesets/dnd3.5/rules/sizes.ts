/** A creature's size, in the numbers its rules read: its modifiers to AC and attack, grapple and Hide, and its weapons' damage step. */

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
