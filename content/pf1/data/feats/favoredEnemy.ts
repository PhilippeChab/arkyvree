import { bonus } from "@/content/core/builders/customization/modifiers.ts";
import { eq } from "@/content/core/builders/customization/requirements.ts";
import { feat } from "@/content/pf1/builders/feats/possession.ts";
import type { FeatSeed } from "@/content/pf1/builders/feats/types.ts";
import { CREATURE_TYPES } from "@/vocabulary/pf1/creatureTypes.ts";
import { FAVORED_ENEMY_FAMILY } from "@/vocabulary/pf1/feats.ts";
import { FEAT_FAMILY, FEAT_GENERATED, FEAT_SELECTABLE, FEAT_STACKABLE } from "@/vocabulary/pf1/fields/index.ts";

const FAVORED_ENEMY_APTITUDE = "Favored Enemy";
const FAVORED_ENEMY_SPECIALIZATION_APTITUDE = "Favored Enemy Specialization";

/**
 * The ranger's increase of one favored enemy's bonuses, at 5th level and every five levels after: a pick of a favored
 * enemy specialization, which his class grants at those levels.
 */
const FAVORED_ENEMY_SPECIALIZATION_UMBRELLA: FeatSeed = {
  name: "Favored Enemy Specialization (Ranger)",
  description:
    "At 5th level and every five levels thereafter, the ranger increases the bonuses against one of his favored enemies, the one he just selected included, by +2.",
  fields: { [FEAT_STACKABLE]: true, [FEAT_SELECTABLE]: false },
  aptitudes: ["Ranger Class Feature"],
  modifiers: [bonus("aptitudes.favoredenemyspecialization.allowed", 1)],
};

/**
 * A favored enemy feat per creature type of the ranger's table (a humanoid's and an outsider's by subtype), its
 * specialization per type, and the ranger's pick of one. Its bonuses apply against those creatures alone: the table
 * applies them.
 */
export const FAVORED_ENEMY_FEATS: FeatSeed[] = [
  // A favored enemy feat per creature type
  ...CREATURE_TYPES.map((t) => ({
    name: `Favored Enemy: ${t}`,
    description: `You select ${t} as a favored enemy: you gain a +2 bonus on Bluff, Knowledge, Perception, Sense Motive, and Survival checks against creatures of this type, and a +2 bonus on weapon attack and damage rolls against them.`,
    fields: { [FEAT_GENERATED]: true, [FEAT_FAMILY]: [FAVORED_ENEMY_FAMILY] },
    aptitudes: [FAVORED_ENEMY_APTITUDE],
  })),
  // Its specialization per type
  ...CREATURE_TYPES.map((t) => ({
    name: `Favored Enemy Specialization: ${t}`,
    description: `Your favored enemy bonuses against ${t} increase by +2. You can take this more than once: its increases stack.`,
    fields: { [FEAT_STACKABLE]: true, [FEAT_GENERATED]: true, [FEAT_FAMILY]: [FAVORED_ENEMY_FAMILY] },
    aptitudes: [FAVORED_ENEMY_SPECIALIZATION_APTITUDE],
    requirements: [eq(feat(`Favored Enemy: ${t}`))],
  })),
  FAVORED_ENEMY_SPECIALIZATION_UMBRELLA,
];
