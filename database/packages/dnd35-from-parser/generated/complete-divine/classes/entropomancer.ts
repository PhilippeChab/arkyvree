import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const ENTROPOMANCER: ClassSeed = {
  name: "Entropomancer",
  description: "Those who walk this path become attuned to the primordial void that they believe resides at the heart of all existence.",
  hd: 8, levels: 10, skillPoints: 2,
  bab: "medium",
  saves: { fortitude: "good", reflex: "poor", will: "good" },
  classSkills: [
    "Concentration",
    "Craft",
    "Heal",
    "Intimidate",
    "Knowledge (Arcana)",
    "Knowledge (Local)",
    "Knowledge (Religion)",
    "Profession",
    "Spellcraft",
  ],
  requirements: [
    gte("skills.concentration.rank", 5),
    gte("skills.knowledgearcana.rank", 5),
    eq("feats.greatfortitude.possessed"),
    eq("feats.magicalaptitude.possessed"),
    gte("spellcasting.divine", 4),
    or(
      eqStr("identity.beliefs.alignment", "Lawful Neutral"),
      eqStr("identity.beliefs.alignment", "True Neutral"),
      eqStr("identity.beliefs.alignment", "Chaotic Neutral"),
      eqStr("identity.beliefs.alignment", "Lawful Evil"),
      eqStr("identity.beliefs.alignment", "Neutral Evil"),
      eqStr("identity.beliefs.alignment", "Chaotic Evil"),
    ),
  ],
  casterLevelAdvancement: { type: "divine", levels: [2, 4, 6, 8, 10] },
  classFeatureAptitude: "Entropomancer Class Feature",
  classFeatures: [
    [1, "Shard of Entropy (Entropomancer)"],
    [1, "Spells per Day/Spells Known (Entropomancer)"],
    [1, "Weapon and Armor Proficiency (Entropomancer)"],
    [3, "Entropic Field (Entropomancer)"],
    [5, "Entropic Field (Entropomancer)"],
    [5, "Entropic Field (Reroll) (Entropomancer)"],
    [5, "Shard of Entropy (Entropomancer)"],
    [7, "Entropic Field (Entropomancer)"],
    [7, "Entropic Field (Wounding) (Entropomancer)"],
    [9, "Shard of Entropy (Entropomancer)"],
    [10, "Control Sphere (Entropomancer)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
