/**
 * The weapons' mastery, a feat per weapon of the Weapons table: a class's Weapon Mastery gives room in its pool, and a
 * character who takes one uses that weapon's mastery property, as the SRD 5.2.1's Mastery Properties describe it.
 */

import { setFlag } from "@/content/core/builders/customization/modifiers.ts";
import { WEAPON_MASTERY_POOL } from "@/content/dnd5/builders/aptitudes/names.ts";
import { weaponMastery } from "@/content/dnd5/builders/feats/proficiencies.ts";
import type { FeatSeed } from "@/content/dnd5/builders/feats/types.ts";
import { stripSeparators } from "@/shared/text.ts";
import { FEAT_FAMILY, FEAT_GENERATED } from "@/vocabulary/dnd5/fields/index.ts";
import { type MASTERY_PROPERTIES, WEAPON_DEFINITIONS, WEAPON_NAMES } from "@/vocabulary/dnd5/weapons.ts";

/** What each mastery property does, as the SRD's Mastery Properties define it. */
// oxfmt-ignore
const MASTERY_EFFECTS: Record<(typeof MASTERY_PROPERTIES)[number], string> = {
  Cleave: "If you hit a creature with a melee attack roll using this weapon, you can make a melee attack roll with the weapon against a second creature within 5 feet of the first that is also within your reach. On a hit, the second creature takes the weapon's damage, but don't add your ability modifier to that damage unless that modifier is negative. You can make this extra attack only once per turn.",
  Graze: "If your attack roll with this weapon misses a creature, you can deal damage to that creature equal to the ability modifier you used to make the attack roll. This damage is the same type dealt by the weapon, and the damage can be increased only by increasing the ability modifier.",
  Nick: "When you make the extra attack of the Light property, you can make it as part of the Attack action instead of as a Bonus Action. You can make this extra attack only once per turn.",
  Push: "If you hit a creature with this weapon, you can push the creature up to 10 feet straight away from yourself if it is Large or smaller.",
  Sap: "If you hit a creature with this weapon, that creature has Disadvantage on its next attack roll before the start of your next turn.",
  Slow: "If you hit a creature with this weapon and deal damage to it, you can reduce its Speed by 10 feet until the start of your next turn. If the creature is hit more than once by weapons that have this property, the Speed reduction doesn't exceed 10 feet.",
  Topple: "If you hit a creature with this weapon, you can force the creature to make a Constitution saving throw (DC 8 plus the ability modifier used to make the attack roll and your Proficiency Bonus). On a failed save, the creature has the Prone condition.",
  Vex: "If you hit a creature with this weapon and deal damage to the creature, you have Advantage on your next attack roll against that creature before the end of your next turn.",
};

/** A weapon's mastery per weapon, in the Weapon Mastery pool, which uses its weapon's mastery property. */
export const WEAPON_MASTERY_FEATS: FeatSeed[] = WEAPON_NAMES.map((weapon) => {
  const mastery = WEAPON_DEFINITIONS[weapon]!.mastery;
  return {
    name: weaponMastery(weapon),
    description: `You can use the mastery property of the ${weapon}, ${mastery}: ${MASTERY_EFFECTS[mastery]}`,
    aptitudes: [WEAPON_MASTERY_POOL],
    modifiers: [setFlag(`items.weapons.${stripSeparators(weapon)}.mastered`)],
    fields: { [FEAT_GENERATED]: true, [FEAT_FAMILY]: ["Weapon Mastery"] },
  };
});
