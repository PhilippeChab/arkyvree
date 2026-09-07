import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const THIEF_ACROBAT: ClassSeed = {
  name: "Thief-acrobat",
  description: "A thief-acrobat excels in getting in and getting out.",
  hd: 6, levels: 5, skillPoints: 6,
  bab: "medium",
  saves: { fortitude: "poor", reflex: "good", will: "poor" },
  classSkills: [
    "Appraise",
    "Balance",
    "Climb",
    "Craft",
    "Disable Device",
    "Escape Artist",
    "Hide",
    "Jump",
    "Move Silently",
    "Open Lock",
    "Perform",
    "Search",
    "Tumble",
    "Use Rope",
  ],
  requirements: [
    gte("skills.balance.rank", 8),
    gte("skills.climb.rank", 8),
    gte("skills.jump.rank", 8),
    gte("skills.tumble.rank", 8),
  ],
  classFeatureAptitude: "Thief-acrobat Class Feature",
  classFeatures: [
    [1, "Fast Acrobatics (Thief-acrobat)"],
    [1, "Kip Up (Thief-acrobat)"],
    [1, "Steady Stance (Thief-acrobat)"],
    [1, "Weapon and Armor Proficiency (Thief-acrobat)"],
    [2, "Agile Fighting (Thief-acrobat)"],
    [2, "Slow Fall (Thief-acrobat)"],
    [3, "Acrobatic Charge (Thief-acrobat)"],
    [3, "Defensive Roll (Thief-acrobat)"],
    [4, "Agile Fighting (Thief-acrobat)"],
    [4, "Skill Mastery (Thief-acrobat)"],
    [4, "Slow Fall (Thief-acrobat)"],
    [5, "Defensive Roll (Thief-acrobat)"],
    [5, "Improved Evasion (Thief-acrobat)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
