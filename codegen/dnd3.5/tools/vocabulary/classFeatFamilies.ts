/** The families of class features (Sneak Attack, Rage…), which a prerequisite checks by the family's name. */

import { FAVORED_ENEMY_FAMILY } from "@/content/dnd3.5/data/feats/favoredEnemy.ts";
import { CLASS_FEATURE_FAMILIES } from "@/shared/dnd3.5/feats.ts";

const CLASS_FEAT_FAMILIES: { family: string; pattern: RegExp }[] = [
  { pattern: /^(?:Turn or Rebuke Undead|Turn Undead|Rebuke Undead)\b/i, family: "Turn or Rebuke Undead" },
  { pattern: /^Wild Shape\b/i, family: "Wild Shape" },
  // "Grace (Duelist)", not "Grace of the Dark"; "Rage (Barbarian)", not "Rage +1 Use/day"
  ...CLASS_FEATURE_FAMILIES.map((family) => ({ pattern: new RegExp(`^${RegExp.escape(family)} \\(`), family })),
];

/** The families of class features, Favored Enemy's included, which a prerequisite checks by the family's name. */
export const CLASS_FEAT_FAMILY_NAMES = [...CLASS_FEAT_FAMILIES.map(({ family }) => family), FAVORED_ENEMY_FAMILY];

/** The family of class features a feature of `name` is ("Rage (Barbarian)": Rage), if any. */
export function findClassFeatFamily(name: string): string | undefined {
  for (const { pattern, family } of CLASS_FEAT_FAMILIES) if (pattern.test(name)) return family;

  return undefined;
}
