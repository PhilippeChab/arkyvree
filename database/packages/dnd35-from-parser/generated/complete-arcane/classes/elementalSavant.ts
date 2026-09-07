import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const ELEMENTAL_SAVANT: ClassSeed = {
  name: "Elemental Savant",
  description: "Elemental savants study the basic building blocks of existence - air, earth, fire, and water - learning to harness their powers.",
  hd: 4, levels: 10, skillPoints: 2,
  bab: "poor",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: ["Concentration", "Knowledge (Arcana)", "Knowledge (The Planes)", "Profession", "Spellcraft"],
  requirements: [
    gte("skills.knowledgearcana.rank", 8),
    gte("skills.knowledgetheplanes.rank", 4),
    or(
      eq("feats.energysubstitutionacid.possessed"),
      eq("feats.energysubstitutioncold.possessed"),
      eq("feats.energysubstitutionelectricity.possessed"),
      eq("feats.energysubstitutionfire.possessed"),
    ),
    or(gte("spellcasting.arcane", 3), gte("spellcasting.divine", 3)),
  ],
  casterLevelAdvancement: { type: "any", levels: [1, 2, 3, 4, 6, 7, 8, 9] },
  classFeatureAptitude: "Elemental Savant Class Feature",
  classFeatures: [
    [1, "Elemental Specialty (Elemental Savant)"],
    [1, "Resistance to Energy 5 (Elemental Savant)"],
    [1, "Spells per Day/Spells Known (Elemental Savant)"],
    [1, "Weapon and Armor Proficiency (Elemental Savant)"],
    [2, "Immunity to Sleep (Elemental Savant)"],
    [3, "Energy Penetration (Elemental Savant)"],
    [4, "Resistance to Energy 10 (Elemental Savant)"],
    [5, "Energy Focus (Elemental Savant)"],
    [6, "Darkvision (Elemental Savant)"],
    [7, "Resistance to Energy 20 (Elemental Savant)"],
    [8, "Energy Penetration (Elemental Savant)"],
    [9, "Immunity to Paralysis and Poison (Elemental Savant)"],
    [10, "Elemental Perfection (Elemental Savant)"],
    [10, "Energy Focus (Elemental Savant)"],
    [10, "Energy Immunity (Elemental Savant)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
