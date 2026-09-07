import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eqStr, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const SACRED_EXORCIST: ClassSeed = {
  name: "Sacred Exorcist",
  description: "",
  hd: 8, levels: 10, skillPoints: 2,
  bab: "medium",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: [
    "Concentration",
    "Craft",
    "Heal",
    "Intimidate",
    "Knowledge (Arcana)",
    "Knowledge (Religion)",
    "Knowledge (The Planes)",
    "Profession",
    "Spellcraft",
  ],
  requirements: [
    gte("skills.knowledgetheplanes.rank", 10),
    gte("skills.knowledgereligion.rank", 7),
    or(eqStr("identity.beliefs.alignment", "Lawful Good"), eqStr("identity.beliefs.alignment", "Neutral Good"), eqStr("identity.beliefs.alignment", "Chaotic Good")),
  ],
  casterLevelAdvancement: { type: "any", levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  classFeatureAptitude: "Sacred Exorcist Class Feature",
  classFeatures: [
    [1, "Exorcism (Sacred Exorcist)"],
    [1, "Spells per Day/Spells Known (Sacred Exorcist)"],
    [1, "Turn Undead (Sacred Exorcist)"],
    [1, "Weapon and Armor Proficiency (Sacred Exorcist)"],
    [2, "Detect Evil (Sacred Exorcist)"],
    [2, "Resist Possession (Sacred Exorcist)"],
    [3, "Chosen Foe (Sacred Exorcist)"],
    [4, "Dispel Evil (Sacred Exorcist)"],
    [5, "Consecrated Presence (Sacred Exorcist)"],
    [6, "Chosen Foe (Sacred Exorcist)"],
    [7, "Dispel Evil (Sacred Exorcist)"],
    [8, "Holy Aura (Sacred Exorcist)"],
    [9, "Chosen Foe (Sacred Exorcist)"],
    [10, "Dispel Evil (Sacred Exorcist)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
