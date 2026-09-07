import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const DWEOMERKEEPER: ClassSeed = {
  name: "Dweomerkeeper",
  description: "Dweomerkeepers serve as guardians devoted to protecting the fabric of magic from those who would damage or corrupt it.",
  hd: 6, levels: 10, skillPoints: 2,
  bab: "poor",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: [
    "Concentration",
    "Craft",
    "Diplomacy",
    "Heal",
    "Knowledge (Arcana)",
    "Knowledge (Architecture and Engineering)",
    "Knowledge (Dungeoneering)",
    "Knowledge (Geography)",
    "Knowledge (History)",
    "Knowledge (Local)",
    "Knowledge (Nature)",
    "Knowledge (Nobility and Royalty)",
    "Knowledge (Psionics)",
    "Knowledge (Religion)",
    "Knowledge (The Planes)",
    "Profession",
    "Spellcraft",
  ],
  requirements: [
    gte("skills.knowledgearcana.rank", 8),
    gte("skills.spellcraft.rank", 8),
    eq("feats.itemcreation.*.possessed"),
    eq("feats.metamagic.*.possessed"),
  ],
  casterLevelAdvancement: { type: "any", levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  classFeatureAptitude: "Dweomerkeeper Class Feature",
  classFeatures: [
    [1, "Mantle of Spells 1 (Dweomerkeeper)"],
    [1, "Spells per Day/Spells Known (Dweomerkeeper)"],
    [1, "Weapon and Armor Proficiency (Dweomerkeeper)"],
    [2, "Arcane Sight (Dweomerkeeper)"],
    [3, "Mantle of Spells 2 (Dweomerkeeper)"],
    [4, "Supernatural Spell (Dweomerkeeper)"],
    [5, "Mantle of Spells 3 (Dweomerkeeper)"],
    [6, "Supernatural Spell (Dweomerkeeper)"],
    [7, "Mantle of Spells 4 (Dweomerkeeper)"],
    [8, "Supernatural Spell (Dweomerkeeper)"],
    [9, "Mantle of Spells 5 (Dweomerkeeper)"],
    [10, "Cloak of Mysteries (Dweomerkeeper)"],
    [10, "Supernatural Spell (Dweomerkeeper)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
