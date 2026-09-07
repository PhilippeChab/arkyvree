import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const MAGE_OF_THE_ARCANE_ORDER: ClassSeed = {
  name: "Mage of the Arcane Order",
  description: "Also called a \"guildmage,\" a member of this prestige class is a spellcaster who belongs to an academy and guild known as the Arcane Order.",
  hd: 4, levels: 10, skillPoints: 2,
  bab: "poor",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: [
    "Concentration",
    "Craft",
    "Decipher Script",
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
    "Speak Language",
    "Spellcraft",
  ],
  requirements: [
    gte("skills.knowledgearcana.rank", 8),
    eq("feats.cooperativespell.possessed"),
    eq("feats.metamagic.*.possessed"),
    gte("spellcasting.arcane", 2),
  ],
  casterLevelAdvancement: { type: "arcane", levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  classFeatureAptitude: "Mage of the Arcane Order Class Feature",
  classFeatures: [
    [1, "Guild Member (Mage of the Arcane Order)"],
    [1, "Spellpool I (Mage of the Arcane Order)"],
    [1, "Spells per Day/Spells Known (Mage of the Arcane Order)"],
    [1, "Weapon and Armor Proficiency (Mage of the Arcane Order)"],
    [2, "Free Metamagic Feat (Mage of the Arcane Order)"],
    [3, "Bonus Language (Mage of the Arcane Order)"],
    [4, "Spellpool Ii (Mage of the Arcane Order)"],
    [5, "New Spell (Mage of the Arcane Order)"],
    [6, "Bonus Language (Mage of the Arcane Order)"],
    [7, "Spellpool Iii (Mage of the Arcane Order)"],
    [8, "New Spell (Mage of the Arcane Order)"],
    [9, "Free Metamagic Feat (Mage of the Arcane Order)"],
    [10, "Regent (Mage of the Arcane Order)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
