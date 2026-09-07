import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const RADIANT_SERVANT_OF_PELOR: ClassSeed = {
  name: "Radiant Servant of Pelor",
  description: "Radiant servants of Pelor embody their faith's teachings by channeling divine solar power through acts of generosity and humble service.",
  hd: 6, levels: 10, skillPoints: 2,
  bab: "medium",
  saves: { fortitude: "good", reflex: "poor", will: "good" },
  classSkills: [
    "Concentration",
    "Craft",
    "Diplomacy",
    "Heal",
    "Knowledge (Arcana)",
    "Knowledge (Religion)",
    "Profession",
    "Sense Motive",
    "Spellcraft",
  ],
  requirements: [
    gte("skills.heal.rank", 5),
    gte("skills.knowledgereligion.rank", 9),
    eq("feats.extraturning.possessed"),
    gte("spellcasting.divine", 1),
    eqStr("identity.beliefs.alignment", "Neutral Good"),
    gte("saves.will.base", 5),
  ],
  casterLevelAdvancement: { type: "divine", levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  classFeatureAptitude: "Radiant Servant of Pelor Class Feature",
  classFeatures: [
    [1, "Extra Greater Turning (Radiant Servant of Pelor)"],
    [1, "Radiance (Radiant Servant of Pelor)"],
    [1, "Spells per Day/Spells Known (Radiant Servant of Pelor)"],
    [1, "Turn Undead (Radiant Servant of Pelor)"],
    [1, "Weapon and Armor Proficiency (Radiant Servant of Pelor)"],
    [2, "Divine Health (Radiant Servant of Pelor)"],
    [2, "Empower Healing (Radiant Servant of Pelor)"],
    [3, "Aura of Warding (Radiant Servant of Pelor)"],
    [6, "Maximize Healing (Radiant Servant of Pelor)"],
    [8, "Positive Energy Burst (Radiant Servant of Pelor)"],
    [10, "Supreme Healing (Radiant Servant of Pelor)"],
  ],
  freeFeats: [
    [5, "Bonus Domain", "Radiant Servant of Pelor Class Feature"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
