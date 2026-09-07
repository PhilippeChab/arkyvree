import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const EFFIGY_MASTER: ClassSeed = {
  name: "Effigy Master",
  description: "The effigy master is an expert in the imitation of true life.",
  hd: 4, levels: 5, skillPoints: 2,
  bab: "poor",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: [
    "Concentration",
    "Craft",
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
    or(gte("skills.craftleatherworking.rank", 10), gte("skills.craftmetalworking.rank", 10), gte("skills.craftwoodworking.rank", 10)),
    gte("skills.knowledgearcana.rank", 5),
    gte("skills.spellcraft.rank", 5),
    gte("skills.usemagicdevice.rank", 2),
    eq("feats.craftwondrousitem.possessed"),
    or(gte("spellcasting.arcane", 1), gte("spellcasting.divine", 1)),
  ],
  casterLevelAdvancement: { type: "any", levels: [2, 3, 4, 5] },
  classFeatureAptitude: "Effigy Master Class Feature",
  classFeatures: [
    [1, "Craft Effigy (Effigy Master)"],
    [1, "Spells per Day/Spells Known (Effigy Master)"],
    [1, "Weapon and Armor Proficiency (Effigy Master)"],
    [3, "Improved Effigy (Effigy Master)"],
    [5, "Effigy Link (Effigy Master)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
