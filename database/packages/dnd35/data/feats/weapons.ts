/** The weapon feats made for every weapon: a proficiency per simple and martial weapon, Weapon Focus for spells. */

import { gte } from "@/database/packages/dnd35/content/customization/requirements.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";
import { MARTIAL_WEAPONS, SIMPLE_WEAPONS } from "@/database/packages/dnd35/data/weapons.ts";
import { FEAT_FAMILY } from "@/shared/dnd3.5/properties/index.ts";

/**
 * Weapon Focus for a kind of spell, a choice the Player's Handbook allows (a ray) and Complete Arcane's Ranged Spell
 * and Touch Spell Specialization require: in the Weapon Focus family, without a weapon to give the bonus to.
 */
export const spellWeaponFocusFeats: FeatSeed[] = ["Ranged Spell", "Touch Spell"].map((spell) => ({
  name: `Weapon Focus: ${spell}`,
  description: `You gain a +1 bonus on attack rolls you make with ${spell.toLowerCase()}s.`,
  generated: true,
  aptitudes: ["General", "Fighter Bonus Feat"],
  requirements: [gte("combat.bab", 1)],
  properties: [{ type: FEAT_FAMILY, value: "Weapon Focus" }],
}));

/**
 * A proficiency feat per simple and martial weapon. A simple one is what a class's proficiencies grant: a character
 * takes Simple Weapon Proficiency, every simple weapon. A martial one is also the feat a character takes, one weapon at
 * a time (SRD), in the Martial Weapon Proficiency family as an exotic one is in its own: Martial Weapon Proficiency
 * itself, every martial weapon, is a class's.
 */
export const weaponProficiencyFeats: FeatSeed[] = [
  ...SIMPLE_WEAPONS.map((w) => ({
    name: `Simple Weapon Proficiency: ${w}`,
    description: `You are proficient with the ${w.toLowerCase()}.`,
    aptitudes: ["General"],
    selectable: false,
    generated: true,
  })),
  ...MARTIAL_WEAPONS.map((w) => ({
    name: `Martial Weapon Proficiency: ${w}`,
    description: `You are proficient with the ${w.toLowerCase()}.`,
    aptitudes: ["General"],
    generated: true,
    properties: [{ type: FEAT_FAMILY, value: "Martial Weapon Proficiency" }],
  })),
];
