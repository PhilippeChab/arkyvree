import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const BATTLE_TRICKSTER: ClassSeed = {
  name: "Battle Trickster",
  description: "The battle trickster engages in combat not only to defeat enemies but to impress them with martial and acrobatic prowess.",
  hd: 10, levels: 3, skillPoints: 4,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: [
    "Balance",
    "Bluff",
    "Climb",
    "Craft",
    "Handle Animal",
    "Jump",
    "Profession",
    "Ride",
    "Swim",
    "Tumble",
    "Use Rope",
  ],
  requirements: [
    gte("combat.bab", 5),
  ],
  classFeatureAptitude: "Battle Trickster Class Feature",
  classFeatures: [
    [1, "Bonus Trick (Battle Trickster)"],
    [2, "Bonus Feat (Battle Trickster)"],
    [3, "Bonus Trick (Battle Trickster)"],
    [3, "Tricky Fighting (Battle Trickster)"],
  ],
  aptitudePicks: [
    { levels: [2], target: "aptitudes.fighterbonusfeat.allowed" },
  ],
};

// TODO: No modifiers defined — review if this class needs any
