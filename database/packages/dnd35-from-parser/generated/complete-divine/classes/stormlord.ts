import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const STORMLORD: ClassSeed = {
  name: "Stormlord",
  description: "Stormlords tend to live as bandits, pursuing their desires for riches, fine food, luxuries, and reckless indulgence, driven by an appetite for sudden, dramatic destruction.",
  hd: 8, levels: 10, skillPoints: 2,
  bab: "medium",
  saves: { fortitude: "good", reflex: "poor", will: "good" },
  classSkills: [
    "Concentration",
    "Disguise",
    "Gather Information",
    "Intimidate",
    "Knowledge (Nature)",
    "Knowledge (Religion)",
    "Survival",
    "Swim",
  ],
  requirements: [
    eq("feats.endurance.possessed"),
    eq("feats.greatfortitude.possessed"),
    eq("feats.weaponfocus.*.possessed"),
    gte("spellcasting.divine", 3),
    gte("saves.fortitude.base", 4),
  ],
  casterLevelAdvancement: { type: "divine", levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  classFeatureAptitude: "Stormlord Class Feature",
  classFeatures: [
    [1, "Enhanced Javelins (Stormlord)"],
    [1, "Resistance to Electricity 5 (Stormlord)"],
    [1, "Spells per Day/Spells Known (Stormlord)"],
    [1, "Weapon and Armor Proficiency (Stormlord)"],
    [2, "Shock Weapon (Stormlord)"],
    [3, "Storm Walk (Stormlord)"],
    [4, "Resistance to Electricity 10 (Stormlord)"],
    [5, "Thundering Weapon (Stormlord)"],
    [6, "Enhanced Javelins (Stormlord)"],
    [6, "Storm Ride (Stormlord)"],
    [7, "Resistance to Electricity 15 (Stormlord)"],
    [8, "Shocking Burst Weapon (Stormlord)"],
    [9, "Enhanced Javelins (Stormlord)"],
    [9, "Immunity to Electricity (Stormlord)"],
    [10, "Elemental Conflagration (Stormlord)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
