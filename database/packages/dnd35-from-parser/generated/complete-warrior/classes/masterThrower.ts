import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const MASTER_THROWER: ClassSeed = {
  name: "Master Thrower",
  description: "Master throwers rely on swift reactions, careful tactics, and precise ranged attacks to overcome their foes.",
  hd: 8, levels: 5, skillPoints: 4,
  bab: "good",
  saves: { fortitude: "poor", reflex: "good", will: "poor" },
  classSkills: [
    "Bluff",
    "Climb",
    "Concentration",
    "Craft",
    "Jump",
    "Perform",
    "Profession",
    "Sleight of Hand",
    "Spot",
    "Tumble",
    "Use Rope",
  ],
  requirements: [
    gte("combat.bab", 5),
    gte("skills.sleightofhand.rank", 4),
    eq("feats.pointblankshot.possessed"),
    eq("feats.preciseshot.possessed"),
    eq("feats.weaponfocus.*.possessed"),
  ],
  classFeatureAptitude: "Master Thrower Class Feature",
  classFeatures: [
    [1, "Thrown Weapon Trick (Master Thrower)"],
    [1, "Weapon and Armor Proficiency (Master Thrower)"],
    [2, "Evasion (Master Thrower)"],
    [3, "Thrown Weapon Trick (Master Thrower)"],
    [5, "Critical Throw (Master Thrower)"],
    [5, "Thrown Weapon Trick (Master Thrower)"],
  ],
  freeFeats: [
    [1, "Quick Draw", "Master Thrower Class Feature"],
    [4, "Snatch Arrows", "Master Thrower Class Feature"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
