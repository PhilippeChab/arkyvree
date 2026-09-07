import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const MAGICAL_TRICKSTER: ClassSeed = {
  name: "Magical Trickster",
  description: "Relying as much on her wits as on her spellcasting prowess, the magical trickster can sacrifice her spellcasting ability to gain even greater access to skill tricks.",
  hd: 6, levels: 3, skillPoints: 4,
  bab: "poor",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: [
    "Bluff",
    "Climb",
    "Concentration",
    "Craft",
    "Diplomacy",
    "Jump",
    "Knowledge (Arcana)",
    "Knowledge (Religion)",
    "Profession",
    "Spellcraft",
    "Tumble",
    "Use Rope",
  ],
  requirements: [
    or(gte("spellcasting.arcane", 3), gte("spellcasting.divine", 3)),
  ],
  casterLevelAdvancement: { type: "any", levels: [2, 3] },
  classFeatureAptitude: "Magical Trickster Class Feature",
  classFeatures: [
    [1, "Bonus Trick (Magical Trickster)"],
    [1, "Spontaneous Trickster (Magical Trickster)"],
    [2, "Bonus Metamagic Feat (Magical Trickster)"],
    [3, "Bonus Trick (Magical Trickster)"],
    [3, "Metamagic Trick (Magical Trickster)"],
    [3, "Tricky Magic (Magical Trickster)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
