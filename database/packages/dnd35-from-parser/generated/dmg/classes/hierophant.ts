import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const HIEROPHANT: ClassSeed = {
  name: "Hierophant",
  description: "A divine caster who has attained great standing with their deity unlocks extraordinary magical powers and capabilities far beyond those available to ordinary followers.",
  hd: 8, levels: 5, skillPoints: 2,
  bab: "poor",
  saves: { fortitude: "good", reflex: "poor", will: "good" },
  classSkills: [
    "Concentration",
    "Craft",
    "Diplomacy",
    "Heal",
    "Knowledge (Arcana)",
    "Knowledge (Religion)",
    "Profession",
    "Spellcraft",
  ],
  requirements: [
    gte("skills.knowledgereligion.rank", 15),
    eq("feats.metamagic.*.possessed"),
    gte("spellcasting.divine", 7),
  ],
  classFeatureAptitude: "Hierophant Class Feature",
  classFeatures: [
    [1, "Special Ability (Hierophant)"],
    [1, "Spells and Caster Level (Hierophant)"],
    [1, "Weapon and Armor Proficiency (Hierophant)"],
    [2, "Special Ability (Hierophant)"],
    [3, "Special Ability (Hierophant)"],
    [4, "Special Ability (Hierophant)"],
    [5, "Special Ability (Hierophant)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
