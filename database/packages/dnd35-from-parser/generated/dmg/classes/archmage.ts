import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const ARCHMAGE: ClassSeed = {
  name: "Archmage",
  description: "Those who reach the pinnacle of arcane spellcasting mastery often pursue the path of the archmage.",
  hd: 4, levels: 5, skillPoints: 2,
  bab: "poor",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: [
    "Concentration",
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
    "Search",
    "Spellcraft",
  ],
  requirements: [
    gte("skills.knowledgearcana.rank", 15),
    gte("skills.spellcraft.rank", 15),
    eq("feats.skillfocusspellcraft.possessed"),
    eq("feats.spellfocus.*.possessed"),
    gte("spellcasting.arcane", 7),
  ],
  casterLevelAdvancement: { type: "arcane", levels: [1, 2, 3, 4, 5] },
  classFeatureAptitude: "Archmage Class Feature",
  classFeatures: [
    [1, "High Arcana (Archmage)"],
    [1, "Spells per Day/Spells Known (Archmage)"],
    [1, "Weapon and Armor Proficiency (Archmage)"],
    [2, "High Arcana (Archmage)"],
    [3, "High Arcana (Archmage)"],
    [4, "High Arcana (Archmage)"],
    [5, "High Arcana (Archmage)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
