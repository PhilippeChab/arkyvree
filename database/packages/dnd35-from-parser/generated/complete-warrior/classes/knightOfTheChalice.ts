import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eqStr, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const KNIGHT_OF_THE_CHALICE: ClassSeed = {
  name: "Knight of the Chalice",
  description: "The knight of the Chalice belongs to a prestigious order of holy warriors dedicated to combating demons and other fiends from the lower planes.",
  hd: 10, levels: 10, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: [
    "Concentration",
    "Craft",
    "Diplomacy",
    "Intimidate",
    "Knowledge (Religion)",
    "Knowledge (The Planes)",
    "Profession",
    "Sense Motive",
  ],
  requirements: [
    gte("combat.bab", 8),
    gte("skills.knowledgetheplanes.rank", 5),
    gte("skills.knowledgereligion.rank", 10),
    gte("spellcasting.divine", 1),
    eqStr("identity.beliefs.alignment", "Lawful Good"),
  ],
  classFeatureAptitude: "Knight of the Chalice Class Feature",
  classFeatures: [
    [1, "Fiendslaying (Knight of the Chalice)"],
    [1, "Spells (Knight of the Chalice)"],
    [1, "Weapon and Armor Proficiency (Knight of the Chalice)"],
    [2, "Censure Demons (Knight of the Chalice)"],
    [2, "Courage of Heaven (Fear) (Knight of the Chalice)"],
    [3, "Fiendslaying (Knight of the Chalice)"],
    [4, "Consecrated Casting (Knight of the Chalice)"],
    [5, "Courage of Heaven (Enchantment) (Knight of the Chalice)"],
    [6, "Fiendslaying (Knight of the Chalice)"],
    [8, "Courage of Heaven (Knight of the Chalice)"],
    [9, "Fiendslaying (Knight of the Chalice)"],
    [10, "Holy Aura (Knight of the Chalice)"],
  ],
  bonusSpellAbility: "Wisdom",
  casterType: "Divine",
  spells: {
    slug: "knightofthechalicespells",
    perDay: [
      [0],
      [1],
      [1, 0],
      [1, 1],
      [1, 1, 0],
      [1, 1, 1],
      [2, 1, 1, 0],
      [2, 1, 1, 1],
      [2, 2, 1, 1],
      [2, 2, 2, 1],
    ],
    knowAll: true,
    noCantrips: true,
  },
};

// TODO: No modifiers defined — review if this class needs any
