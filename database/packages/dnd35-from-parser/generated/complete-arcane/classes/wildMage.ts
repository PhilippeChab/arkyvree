import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const WILD_MAGE: ClassSeed = {
  name: "Wild Mage",
  description: "Wild mages aspire to cast spells without structure.",
  hd: 4, levels: 10, skillPoints: 2,
  bab: "poor",
  saves: { fortitude: "poor", reflex: "good", will: "poor" },
  classSkills: [
    "Bluff",
    "Concentration",
    "Craft",
    "Intimidate",
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
    "Use Magic Device",
  ],
  requirements: [
    gte("skills.knowledgetheplanes.rank", 4),
    gte("skills.spellcraft.rank", 8),
    gte("skills.usemagicdevice.rank", 4),
    eq("feats.magicalaptitude.possessed"),
    eq("feats.metamagic.*.possessed"),
    or(eqStr("identity.beliefs.alignment", "Chaotic Good"), eqStr("identity.beliefs.alignment", "Chaotic Neutral"), eqStr("identity.beliefs.alignment", "Chaotic Evil")),
  ],
  casterLevelAdvancement: { type: "arcane", levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  classFeatureAptitude: "Wild Mage Class Feature",
  classFeatures: [
    [1, "Spells per Day/Spells Known (Wild Mage)"],
    [1, "Weapon and Armor Proficiency (Wild Mage)"],
    [1, "Wild Magic (Wild Mage)"],
    [2, "Random Deflector (Wild Mage)"],
    [3, "Student of Chaos (Wild Mage)"],
    [5, "Random Deflector (Wild Mage)"],
    [6, "Chaotic Mind (Wild Mage)"],
    [8, "Random Deflector (Wild Mage)"],
    [9, "Reckless Dweomer (Wild Mage)"],
    [10, "Wildstrike (Wild Mage)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
