import { bonus } from "@/content/core/builders/customization/modifiers.ts";
import { eq } from "@/content/core/builders/customization/requirements.ts";
import { feat } from "@/content/dnd3.5/builders/feats/possession.ts";
import type { FeatSeed } from "@/content/dnd3.5/builders/feats/types.ts";
import { CREATURE_TYPES } from "@/vocabulary/dnd3.5/creatureTypes.ts";
import { FAVORED_ENEMY_FAMILY } from "@/vocabulary/dnd3.5/feats.ts";
import { FEAT_FAMILY } from "@/vocabulary/dnd3.5/properties/index.ts";

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
  modifiers: [bonus("aptitudes.favoredenemyspecialization.allowed", 1)],
};

/** A favored enemy feat per creature type, its specialization per type, and the ranger's pick of one. */
export const FAVORED_ENEMY_FEATS: FeatSeed[] = [
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
