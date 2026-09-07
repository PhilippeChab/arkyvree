import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const NATURES_WARRIOR: ClassSeed = {
  name: "Nature's Warrior",
  description: "Nature's warriors champion the untamed wilderness, serving as guardians of the natural order. Many are druids who have embraced their wild shape so deeply that the boundary between their civilized and bestial selves has blurred.",
  hd: 10, levels: 5, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: [
    "Diplomacy",
    "Handle Animal",
    "Intimidate",
    "Jump",
    "Knowledge (Nature)",
    "Listen",
    "Survival",
    "Swim",
  ],
  requirements: [
    gte("combat.bab", 4),
    gte("skills.knowledgenature.rank", 8),
    gte("skills.knowledgetheplanes.rank", 2),
    gte("skills.survival.rank", 8),
    eq("feats.track.possessed"),
    eq("feats.wildshape.*.possessed"),
  ],
  casterLevelAdvancement: { type: "divine", levels: [2, 4] },
  classFeatureAptitude: "Nature's Warrior Class Feature",
  classFeatures: [
    [1, "Nature's Armament (Nature's Warrior)"],
    [1, "Spells per Day (Nature's Warrior)"],
    [1, "Weapon and Armor Proficiency (Nature's Warrior)"],
    [1, "Wilding (Nature's Warrior)"],
    [3, "Nature's Armament (Nature's Warrior)"],
    [5, "Nature's Armament (Nature's Warrior)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
