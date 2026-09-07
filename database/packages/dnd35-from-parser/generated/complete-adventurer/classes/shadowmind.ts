import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const SHADOWMIND: ClassSeed = {
  name: "Shadowmind",
  description: "A shadowmind blends psionic powers and uncanny stealth into an effective whole.",
  hd: 6, levels: 10, skillPoints: 4,
  bab: "medium",
  saves: { fortitude: "poor", reflex: "good", will: "good" },
  classSkills: [
    "Bluff",
    "Concentration",
    "Craft",
    "Disable Device",
    "Escape Artist",
    "Hide",
    "Jump",
    "Knowledge (Psionics)",
    "Listen",
    "Move Silently",
    "Open Lock",
    "Search",
    "Sense Motive",
    "Sleight of Hand",
    "Spot",
    "Tumble",
  ],
  requirements: [
    gte("combat.bab", 3),
    gte("skills.hide.rank", 5),
    gte("skills.movesilently.rank", 5),
    gte("skills.sleightofhand.rank", 3),
    gte("classes.manifester.level", 3),
  ],
  casterLevelAdvancement: { type: "any", levels: [1, 3, 4, 6, 7, 9, 10] },
  classFeatureAptitude: "Shadowmind Class Feature",
  classFeatures: [
    [1, "Read Thoughts (Shadowmind)"],
    [1, "Weapon and Armor Proficiency (Shadowmind)"],
    [2, "Sneak Attack (Shadowmind)"],
    [3, "Cloud Mind (Shadowmind)"],
    [5, "Sneak Attack (Shadowmind)"],
    [8, "Sneak Attack (Shadowmind)"],
    [9, "Mass Cloud Mind (Shadowmind)"],
    [10, "Mind Stab (Shadowmind)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
