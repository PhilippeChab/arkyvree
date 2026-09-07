import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const BLOOD_MAGUS: ClassSeed = {
  name: "Blood Magus",
  description: "Blood magi are deceased spellcasters who gain an understanding of blood's importance when returned to life.",
  hd: 6, levels: 10, skillPoints: 2,
  bab: "poor",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: ["Bluff", "Concentration", "Craft", "Heal", "Spellcraft"],
  requirements: [
    gte("skills.concentration.rank", 4),
    eq("feats.greatfortitude.possessed"),
  ],
  casterLevelAdvancement: { type: "arcane", levels: [1, 2, 3, 4, 6, 7, 8, 9] },
  classFeatureAptitude: "Blood Magus Class Feature",
  classFeatures: [
    [1, "Blood Component (Blood Magus)"],
    [1, "Durable Casting (Blood Magus)"],
    [1, "Spells per Day/Spells Known (Blood Magus)"],
    [1, "Stanch (Blood Magus)"],
    [1, "Weapon and Armor Proficiency (Blood Magus)"],
    [2, "Scarification (Blood Magus)"],
    [3, "Death Knell (Blood Magus)"],
    [4, "Blood Draught (Blood Magus)"],
    [5, "Homunculus (Blood Magus)"],
    [6, "Bloodseeking Spell (Blood Magus)"],
    [7, "Thicker Than Water (Blood Magus)"],
    [8, "Awaken Blood (Blood Magus)"],
    [9, "Infusion (Blood Magus)"],
    [10, "Bloodwalk (Blood Magus)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
