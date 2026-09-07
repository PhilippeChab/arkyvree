import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const MASTER_OF_SHROUDS: ClassSeed = {
  name: "Master of Shrouds",
  description: "A master of shrouds is an evil divine caster who specializes in compelling incorporeal undead into service. She wrenches creatures like wraiths and shadows from their haunted lairs, calling them forth and forcing them to carry out her commands. Enraged by their involuntary bondage, these undead leave devastation and terror wherever they go. Most who pursue this path have cleric training. Paladins never follow this route, though fallen paladins may, especially those who have strayed far enough from lawful good ideals to become blackguards. Multiclassed clerics are also commonly drawn to this prestige class, including cleric/fighters and cleric/rogues. A handful of cleric/necromancer/mystic theurges adopt this role at their highest levels.",
  hd: 8, levels: 10, skillPoints: 2,
  bab: "medium",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: [
    "Concentration",
    "Craft",
    "Diplomacy",
    "Intimidate",
    "Knowledge (Arcana)",
    "Knowledge (Religion)",
    "Profession",
    "Spellcraft",
  ],
  requirements: [
    gte("skills.concentration.rank", 10),
    gte("skills.spellcraft.rank", 10),
    gte("spellcasting.divine", 1),
    gte("saves.will.base", 5),
  ],
  casterLevelAdvancement: { type: "divine", levels: [2, 4, 6, 8, 10] },
  classFeatureAptitude: "Master of Shrouds Class Feature",
  classFeatures: [
    [1, "Spells per Day/Spells Known (Master of Shrouds)"],
    [1, "Summon Undead (Allip/shadow) (Master of Shrouds)"],
    [1, "Weapon and Armor Proficiency (Master of Shrouds)"],
    [3, "Summon Undead (Allips/shadows) (Master of Shrouds)"],
    [5, "Summon Undead (Wraiths) (Master of Shrouds)"],
    [7, "Summon Undead (Spectres) (Master of Shrouds)"],
    [9, "Summon Undead (Greater Shadows) (Master of Shrouds)"],
  ],
  freeFeats: [
    [2, "Extra Turning", "Master of Shrouds Class Feature"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
