import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const GEOMETER: ClassSeed = {
  name: "Geometer",
  description: "The geometer is the master of written magic and spells inscribed within a perfectly rendered diagram.",
  hd: 4, levels: 5, skillPoints: 2,
  bab: "poor",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: [
    "Concentration",
    "Craft",
    "Decipher Script",
    "Disable Device",
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
    gte("skills.decipherscript.rank", 9),
    gte("skills.disabledevice.rank", 4),
    gte("skills.knowledgearcana.rank", 9),
    gte("skills.search.rank", 4),
    eq("feats.scribescroll.possessed"),
    gte("spellcasting.arcane", 3),
  ],
  casterLevelAdvancement: { type: "arcane", levels: [1, 2, 3, 4, 5] },
  classFeatureAptitude: "Geometer Class Feature",
  classFeatures: [
    [1, "Draw Spellglyph (Geometer)"],
    [1, "Glyph of Warding (Geometer)"],
    [1, "Spells per Day/Spells Known (Geometer)"],
    [1, "Weapon and Armor Proficiency (Geometer)"],
    [2, "Book of Geometry (Geometer)"],
    [3, "Sigilsight (Geometer)"],
    [4, "Pass Sigil (Geometer)"],
    [5, "Greater Glyph of Warding (Geometer)"],
    [5, "Powerful Spellglyph (Geometer)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
