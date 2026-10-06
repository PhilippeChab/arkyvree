import { eq, feat } from "@/database/packages/dnd35/content/requirements.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/types.ts";
import { CREATURE_TYPES } from "@/database/packages/dnd35/data/creatureTypes.ts";
import { FEAT_FAMILY } from "@/shared/dnd3.5/properties/index.ts";

const FAVORED_ENEMY_APTITUDE = "Favored Enemy";
const FAVORED_ENEMY_SPECIALIZATION_APTITUDE = "Favored Enemy Specialization";

const FAVORED_ENEMY_SPECIALIZATION_UMBRELLA = "Favored Enemy Specialization (Ranger)";
const favoredEnemySpecializationUmbrella: FeatSeed = {
  name: FAVORED_ENEMY_SPECIALIZATION_UMBRELLA,
  description:
    "At 5th level and every 5 levels thereafter, the ranger may increase the bonus against one of their favored enemies by +2.",
  stackable: true,
  selectable: false,
  aptitudes: ["Ranger Class Feature"],
  modifiers: [
    { target: "aptitudes.favoredenemyspecialization.allowed", operator: "add", value: "1", valueType: "number" },
  ],
};

export const FAVORED_ENEMY_FAMILY = "Favored Enemy";

/** A favored enemy feat per creature type, its specialization per type, and the ranger's pick of one. */
export const favoredEnemyFeats: FeatSeed[] = [
  // A favored enemy feat per creature type
  ...CREATURE_TYPES.map((t) => ({
    name: `Favored Enemy: ${t}`,
    description: `Designate ${t} as a favored enemy. +2 on Bluff, Listen, Sense Motive, Spot, and Survival checks made against ${t}, and +2 on weapon damage rolls targeting them.`,
    generated: true,
    aptitudes: [FAVORED_ENEMY_APTITUDE],
    properties: [{ type: FEAT_FAMILY, value: FAVORED_ENEMY_FAMILY }],
  })),
  // Its specialization per type
  ...CREATURE_TYPES.map((t) => ({
    name: `Favored Enemy Specialization: ${t}`,
    description: `Increases your favored enemy bonus against ${t} by +2. May be taken multiple times to stack the bonus further.`,
    stackable: true,
    generated: true,
    aptitudes: [FAVORED_ENEMY_SPECIALIZATION_APTITUDE],
    requirements: [eq(feat(`Favored Enemy: ${t}`))],
    properties: [{ type: FEAT_FAMILY, value: FAVORED_ENEMY_FAMILY }],
  })),
  favoredEnemySpecializationUmbrella,
];
