import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eqStr, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const SHINING_BLADE_OF_HEIRONEOUS: ClassSeed = {
  name: "Shining Blade of Heironeous",
  description: "A shining blade of Heironeous belongs to a knightly order devoted to excellence in close-quarters combat.",
  hd: 10, levels: 10, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "good" },
  classSkills: ["Concentration", "Craft", "Diplomacy", "Heal", "Knowledge (Religion)", "Profession", "Spellcraft"],
  requirements: [
    gte("combat.bab", 7),
    gte("skills.knowledgereligion.rank", 7),
    gte("spellcasting.divine", 1),
    eqStr("identity.beliefs.alignment", "Lawful Good"),
    gte("saves.will.base", 3),
  ],
  casterLevelAdvancement: { type: "divine", levels: [2, 4, 6, 8, 10] },
  classFeatureAptitude: "Shining Blade of Heironeous Class Feature",
  classFeatures: [
    [1, "Shock Blade (Shining Blade of Heironeous)"],
    [1, "Spells per Day/Spells Known (Shining Blade of Heironeous)"],
    [1, "Weapon and Armor Proficiency (Shining Blade of Heironeous)"],
    [3, "Shock Blade (Shining Blade of Heironeous)"],
    [5, "Holy Blade (Shining Blade of Heironeous)"],
    [7, "Holy Blade (Shining Blade of Heironeous)"],
    [9, "Brilliant Blade (Shining Blade of Heironeous)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
