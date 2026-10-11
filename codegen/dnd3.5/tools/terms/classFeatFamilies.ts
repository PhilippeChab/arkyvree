/** The families of class features (Sneak Attack, Rage…), which a prerequisite checks by the family's name. */

import { CLASS_FEATURE_FAMILIES, FAVORED_ENEMY_FAMILY } from "@/vocabulary/dnd3.5/feats.ts";

const CLASS_FEAT_FAMILIES: { family: string; pattern: RegExp }[] = [
  { pattern: /^(?:Turn or Rebuke Undead|Turn Undead|Rebuke Undead)\b/i, family: "Turn or Rebuke Undead" },
  { pattern: /^Wild Shape\b/i, family: "Wild Shape" },
  // Any smite, of whatever kind: "Smite Evil (Paladin)", "Smite Undead (Hunter of the Dead)", "Kiai Smite (Samurai)"
  { pattern: /^(?:Kiai )?Smite\b/i, family: "Smite" },
  // "Grace (Duelist)", not "Grace of the Dark"; "Rage (Barbarian)", not "Rage +1 Use/day"
  ...CLASS_FEATURE_FAMILIES.map((family) => ({ pattern: new RegExp(`^${RegExp.escape(family)} \\(`), family })),
];

/** The families of class features, Favored Enemy's included, which a prerequisite checks by the family's name. */
export const CLASS_FEAT_FAMILY_NAMES = [...CLASS_FEAT_FAMILIES.map(({ family }) => family), FAVORED_ENEMY_FAMILY];

/** The families of class features a feature of `name` is in ("Rage (Barbarian)": Rage; "Smite Evil (Paladin)": Smite and Smite Evil). */
export function findClassFeatFamilies(name: string): string[] {
  return CLASS_FEAT_FAMILIES.filter(({ pattern }) => pattern.test(name)).map(({ family }) => family);
}
