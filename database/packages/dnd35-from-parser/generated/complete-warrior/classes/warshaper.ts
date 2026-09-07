import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const WARSHAPER: ClassSeed = {
  name: "Warshaper",
  description: "A warshaper develops and reshapes her own body, growing custom natural weaponry and defenses tailored to whatever challenge she faces.",
  hd: 8, levels: 5, skillPoints: 2,
  bab: "medium",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: ["Balance", "Climb", "Concentration", "Craft", "Disguise", "Escape Artist", "Jump", "Swim"],
  requirements: [
    gte("combat.bab", 4),
  ],
  classFeatureAptitude: "Warshaper Class Feature",
  classFeatures: [
    [1, "Morphic Immunities (Warshaper)"],
    [1, "Morphic Weapons (Warshaper)"],
    [1, "Weapon and Armor Proficiency (Warshaper)"],
    [2, "Morphic Body (Warshaper)"],
    [3, "Morphic Reach (Warshaper)"],
    [4, "Morphic Healing (Warshaper)"],
    [5, "Flashmorph/multimorph (Warshaper)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
