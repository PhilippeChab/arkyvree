import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const MAESTER: ClassSeed = {
  name: "Maester",
  description: "Maesters are the master crafters of the gnome world, combining technical and magical expertise to create incredible marvels. They specialize in the creation of magic items, bending all their skill and ability toward the construction of items that are their art and livelihood. Maesters are usually wizards, although sorcerers occasionally take up the class. Some bards also have been known to become maesters, but typically not until they have spent a number of years adventuring.",
  hd: 4, levels: 5, skillPoints: 4,
  bab: "poor",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: [
    "Appraise",
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
    "Knowledge (Religion)",
    "Knowledge (The Planes)",
    "Profession",
    "Search",
    "Spellcraft",
    "Use Magic Device",
  ],
  requirements: [
    gte("skills.craft.rank", 8),
    gte("skills.usemagicdevice.rank", 4),
    eq("feats.any.*.possessed"),
    eqStr("identity.physiology.race.name", "Gnome"),
  ],
  casterLevelAdvancement: { type: "any", levels: [2, 3, 4, 5] },
  classFeatureAptitude: "Maester Class Feature",
  classFeatures: [
    [1, "Bonus Feat (Maester)"],
    [1, "Quick Crafting (Maester)"],
    [1, "Spells per Day/Spells Known (Maester)"],
    [1, "Weapon and Armor Proficiency (Maester)"],
    [3, "Identification (Maester)"],
    [5, "Bonus Feat (Maester)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
