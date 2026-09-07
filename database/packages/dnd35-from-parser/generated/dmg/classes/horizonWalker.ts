import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const HORIZON_WALKER: ClassSeed = {
  name: "Horizon Walker",
  description: "A horizon walker is a relentless explorer who ventures into the most perilous regions across all planes of existence.",
  hd: 8, levels: 10, skillPoints: 4,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: [
    "Balance",
    "Climb",
    "Diplomacy",
    "Handle Animal",
    "Hide",
    "Knowledge (Geography)",
    "Listen",
    "Move Silently",
    "Profession",
    "Ride",
    "Speak Language",
    "Spot",
    "Survival",
  ],
  requirements: [
    gte("skills.knowledgegeography.rank", 8),
    eq("feats.endurance.possessed"),
  ],
  classFeatureAptitude: "Horizon Walker Class Feature",
  classFeatures: [
    [1, "Terrain Mastery (Horizon Walker)"],
    [1, "Weapon and Armor Proficiency (Horizon Walker)"],
    [2, "Terrain Mastery (Horizon Walker)"],
    [3, "Terrain Mastery (Horizon Walker)"],
    [4, "Terrain Mastery (Horizon Walker)"],
    [5, "Terrain Mastery (Horizon Walker)"],
    [6, "Planar Terrain Mastery (Horizon Walker)"],
    [7, "Planar Terrain Mastery (Horizon Walker)"],
    [8, "Planar Terrain Mastery (Horizon Walker)"],
    [9, "Planar Terrain Mastery (Horizon Walker)"],
    [10, "Planar Terrain Mastery (Horizon Walker)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
