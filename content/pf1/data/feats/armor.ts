/**
 * The armor and shield proficiencies: what a class grants, and a character can take, each named as the Core Rulebook's
 * page prints it. An armor's or a shield's proficiency requirement names its feat (`LIGHT_ARMOR_PROF`…).
 */

import { eq } from "@/content/core/builders/customization/requirements.ts";
import { feat } from "@/content/pf1/builders/feats/possession.ts";
import type { FeatSeed } from "@/content/pf1/builders/feats/types.ts";

import { COMBAT_FEAT } from "./pools.ts";

/** What wearing armor one is proficient with spares: its armor check penalty on all but a few skills. */
const ARMOR_BENEFIT =
  "When you wear a type of armor with which you are proficient, the armor check penalty for that armor applies only to Dexterity- and Strength-based skill checks.";

/** The armor proficiencies, light, medium and heavy, each requiring those before it. */
export const ARMOR_PROFICIENCY_FEATS: FeatSeed[] = [
  {
    name: "Armor Proficiency, Light",
    description: ARMOR_BENEFIT,
    aptitudes: COMBAT_FEAT,
  },
  {
    name: "Armor Proficiency, Medium",
    description: ARMOR_BENEFIT,
    aptitudes: COMBAT_FEAT,
    requirements: [eq(feat("Armor Proficiency, Light"))],
  },
  {
    name: "Armor Proficiency, Heavy",
    description: ARMOR_BENEFIT,
    aptitudes: COMBAT_FEAT,
    requirements: [eq(feat("Armor Proficiency, Light")), eq(feat("Armor Proficiency, Medium"))],
  },
];

/** The shield proficiencies: every shield's but the tower shield, and the tower shield's, which requires it. */
export const SHIELD_PROFICIENCY_FEATS: FeatSeed[] = [
  {
    name: "Shield Proficiency",
    description:
      "When you use a shield (except a tower shield), the shield's armor check penalty only applies to Strength- and Dexterity-based skills.",
    aptitudes: COMBAT_FEAT,
  },
  {
    name: "Tower Shield Proficiency",
    description:
      "When you use a tower shield, the shield's armor check penalty only applies to Strength- and Dexterity-based skills.",
    aptitudes: COMBAT_FEAT,
    requirements: [eq(feat("Shield Proficiency"))],
  },
];
