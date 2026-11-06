/**
 * The weapon feats made for every weapon, and those the Core Rulebook's pages give whole: a proficiency per simple,
 * martial and exotic weapon, the simple and martial weapons' own, and Weapon Focus for a ray or a grapple.
 */

import { gte } from "@/content/core/builders/customization/requirements.ts";
import type { FeatSeed } from "@/content/pf1/builders/feats/types.ts";
import { FEAT_FAMILY, FEAT_GENERATED, FEAT_SELECTABLE } from "@/vocabulary/pf1/fields/index.ts";
import { EXOTIC_WEAPONS, MARTIAL_WEAPONS, SIMPLE_WEAPONS } from "@/vocabulary/pf1/weapons.ts";

import { COMBAT_FEAT } from "./pools.ts";

/**
 * A proficiency feat per simple, martial and exotic weapon. A simple one is only granted (a druid's club, a wizard's
 * crossbows): a character takes Simple Weapon Proficiency, every simple weapon. A martial one is the feat a character
 * takes, one weapon at a time, in the Martial Weapon Proficiency family as an exotic one is in its own: Martial Weapon
 * Proficiency itself, every martial weapon, is a class's.
 */
const WEAPON_FAMILY_FEATS: FeatSeed[] = [
  ...SIMPLE_WEAPONS.map((w) => ({
    name: `Simple Weapon Proficiency: ${w}`,
    description: `You make attack rolls with the ${w.toLowerCase()} without penalty.`,
    aptitudes: ["General"],
    fields: { [FEAT_SELECTABLE]: false, [FEAT_GENERATED]: true },
  })),
  ...MARTIAL_WEAPONS.map((w) => ({
    name: `Martial Weapon Proficiency: ${w}`,
    description: `You make attack rolls with the ${w.toLowerCase()} normally (without the nonproficient penalty).`,
    aptitudes: COMBAT_FEAT,
    fields: { [FEAT_GENERATED]: true, [FEAT_FAMILY]: ["Martial Weapon Proficiency"] },
  })),
  ...EXOTIC_WEAPONS.map((w) => ({
    name: `Exotic Weapon Proficiency: ${w}`,
    description: `You make attack rolls with the ${w.toLowerCase()} normally.`,
    aptitudes: COMBAT_FEAT,
    requirements: [gte("combat.bab", 1)],
    fields: { [FEAT_GENERATED]: true, [FEAT_FAMILY]: ["Exotic Weapon Proficiency"] },
  })),
];

/** Every simple weapon's proficiency, and every martial weapon's, which a class grants whole. */
const WEAPON_GROUP_FEATS: FeatSeed[] = [
  {
    name: "Simple Weapon Proficiency",
    description: "You make attack rolls with simple weapons without penalty.",
    aptitudes: COMBAT_FEAT,
  },
  {
    name: "Martial Weapon Proficiency",
    description:
      "You make attack rolls with every martial weapon normally, as barbarians, fighters, paladins and rangers do. A character who takes the feat chooses one martial weapon each time: Martial Weapon Proficiency: Longsword, and so on.",
    aptitudes: ["General"],
    fields: { [FEAT_SELECTABLE]: false },
  },
];

/**
 * Weapon Focus for what's no weapon, as the Core Rulebook allows it: a ray, for a spellcaster, and a grapple. In the
 * Weapon Focus family, with no weapon to give the bonus to: the table applies it.
 */
export const SPECIAL_WEAPON_FOCUS_FEATS: FeatSeed[] = [
  {
    name: "Weapon Focus: Ray",
    description: "You gain a +1 bonus on attack rolls you make with rays.",
    fields: { [FEAT_GENERATED]: true, [FEAT_FAMILY]: ["Weapon Focus"] },
    aptitudes: COMBAT_FEAT,
    requirements: [gte("combat.bab", 1), gte("spellcasting.casterlevel", 1)],
  },
  {
    name: "Weapon Focus: Grapple",
    description: "You gain a +1 bonus on combat maneuver checks you make to grapple.",
    fields: { [FEAT_GENERATED]: true, [FEAT_FAMILY]: ["Weapon Focus"] },
    aptitudes: COMBAT_FEAT,
    requirements: [gte("combat.bab", 1)],
  },
];

/** The weapon proficiencies, each weapon's and the simple and martial weapons' own. */
export const WEAPON_PROFICIENCY_FEATS: FeatSeed[] = [...WEAPON_GROUP_FEATS, ...WEAPON_FAMILY_FEATS];
