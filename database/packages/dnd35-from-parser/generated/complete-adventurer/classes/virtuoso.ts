import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const VIRTUOSO: ClassSeed = {
  name: "Virtuoso",
  description: "The typical virtuoso is outgoing, charismatic, and gregarious.",
  hd: 6, levels: 10, skillPoints: 6,
  bab: "poor",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: [
    "Balance",
    "Bluff",
    "Concentration",
    "Craft",
    "Diplomacy",
    "Disguise",
    "Escape Artist",
    "Gather Information",
    "Intimidate",
    "Jump",
    "Perform",
    "Spellcraft",
    "Tumble",
  ],
  requirements: [
    gte("skills.diplomacy.rank", 4),
    gte("skills.intimidate.rank", 4),
    gte("skills.perform.rank", 10),
  ],
  casterLevelAdvancement: { type: "arcane", levels: [2, 3, 4, 5, 6, 7, 8, 9, 10] },
  classFeatureAptitude: "Virtuoso Class Feature",
  classFeatures: [
    [1, "Bardic Music (Fascinate) (Virtuoso)"],
    [1, "Spells per Day/Spells Known (Virtuoso)"],
    [1, "Virtuoso Performance (Persuasive Song) (Virtuoso)"],
    [1, "Weapon and Armor Proficiency (Virtuoso)"],
    [3, "Virtuoso Performance (Sustaining Song) (Virtuoso)"],
    [5, "Virtuoso Performance (Jarring Song) (Virtuoso)"],
    [7, "Virtuoso Performance (Song of Fury) (Virtuoso)"],
    [9, "Virtuoso Performance (Mindbending Melody) (Virtuoso)"],
    [10, "Virtuoso Performance (Revealing Melody) (Virtuoso)"],
  ],
};

// TODO: Unresolved aptitude pick: "Virtuoso Performance (Persuasive Song)"
// TODO: No modifiers defined — review if this class needs any
