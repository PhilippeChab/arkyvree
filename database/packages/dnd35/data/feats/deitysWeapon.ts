/**
 * Complete Divine's Deity's Weapon Focus and Specialization, one per weapon: the favored soul picks her deity's at the
 * levels her class features give a pick (3rd and 12th), and gets Weapon Focus or Specialization with it.
 */

import type { FeatSeed } from "@/database/packages/dnd35/content/types.ts";
import { ALL_WEAPONS } from "@/database/packages/dnd35/data/weapons.ts";
import { FEAT_FAMILY } from "@/shared/dnd3.5/properties/index.ts";
import { stripSeparators } from "@/shared/text.ts";

const DEITYS_WEAPON_FOCUS: FeatSeed[] = ALL_WEAPONS.map((w) => ({
  name: `Deity's Weapon Focus: ${w}`,
  description: `You gain Weapon Focus with ${w} as granted by your deity.`,
  generated: true,
  aptitudes: ["Deity's Weapon Focus"],
  modifiers: [
    {
      target: `feats.weaponfocus${stripSeparators(w)}.possessed`,
      operator: "set",
      value: "true",
      valueType: "boolean",
    },
  ],
  properties: [{ type: FEAT_FAMILY, value: "Weapon Focus" }],
}));

const DEITYS_WEAPON_SPECIALIZATION: FeatSeed[] = ALL_WEAPONS.map((w) => ({
  name: `Deity's Weapon Specialization: ${w}`,
  description: `You gain Weapon Specialization with ${w} as granted by your deity.`,
  generated: true,
  aptitudes: ["Deity's Weapon Specialization"],
  modifiers: [
    {
      target: `feats.weaponspecialization${stripSeparators(w)}.possessed`,
      operator: "set",
      value: "true",
      valueType: "boolean",
    },
  ],
  properties: [{ type: FEAT_FAMILY, value: "Weapon Specialization" }],
}));

export const DEITYS_WEAPON_FEATS = [...DEITYS_WEAPON_FOCUS, ...DEITYS_WEAPON_SPECIALIZATION];
