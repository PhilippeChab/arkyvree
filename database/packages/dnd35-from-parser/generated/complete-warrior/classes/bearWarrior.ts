import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const BEAR_WARRIOR: ClassSeed = {
  name: "Bear Warrior",
  description: "Bear warriors forge a spiritual bond with bear totems, channeling ursine ferocity in combat. When they enter a battle fury, they physically transform into bears, gaining the raw power and resilience of these mighty creatures.",
  hd: 12, levels: 10, skillPoints: 4,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: ["Climb", "Handle Animal", "Intimidate", "Ride", "Survival", "Swim"],
  requirements: [
    gte("combat.bab", 7),
    eq("feats.powerattack.possessed"),
    eq("feats.rage.possessed"),
  ],
  classFeatureAptitude: "Bear Warrior Class Feature",
  classFeatures: [
    [1, "Bear Form (Bear Warrior)"],
    [1, "Weapon and Armor Proficiency (Bear Warrior)"],
    [3, "Scent (Bear Warrior)"],
    [5, "Bear Form (Bear Warrior)"],
    [7, "Rage (Bear Warrior)"],
    [10, "Bear Form (Bear Warrior)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
