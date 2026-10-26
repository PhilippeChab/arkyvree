/**
 * Complete Divine's Deity's Weapon Focus and Specialization, one per weapon: the favored soul picks her deity's at the
 * levels her class features give a pick (3rd and 12th), and gets Weapon Focus or Specialization with it.
 */

import { grantFeat } from "@/content/dnd3.5/builders/feats/possession.ts";
import type { FeatSeed } from "@/content/dnd3.5/builders/feats/types.ts";
import { FEAT_FAMILY, FEAT_GENERATED } from "@/vocabulary/dnd3.5/fields/index.ts";
import { ALL_WEAPONS } from "@/vocabulary/dnd3.5/weapons.ts";

const DEITYS_WEAPON_FOCUS: FeatSeed[] = ALL_WEAPONS.map((w) => ({
  name: `Deity's Weapon Focus: ${w}`,
  description: `You gain Weapon Focus with ${w} as granted by your deity.`,
  fields: { [FEAT_GENERATED]: true, [FEAT_FAMILY]: ["Weapon Focus"] },
  aptitudes: ["Deity's Weapon Focus"],
  modifiers: [grantFeat(`Weapon Focus: ${w}`)],
}));

const DEITYS_WEAPON_SPECIALIZATION: FeatSeed[] = ALL_WEAPONS.map((w) => ({
  name: `Deity's Weapon Specialization: ${w}`,
  description: `You gain Weapon Specialization with ${w} as granted by your deity.`,
  fields: { [FEAT_GENERATED]: true, [FEAT_FAMILY]: ["Weapon Specialization"] },
  aptitudes: ["Deity's Weapon Specialization"],
  modifiers: [grantFeat(`Weapon Specialization: ${w}`)],
}));

export const DEITYS_WEAPON_FEATS = [...DEITYS_WEAPON_FOCUS, ...DEITYS_WEAPON_SPECIALIZATION];
