import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eqStr, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const RAINBOW_SERVANT: ClassSeed = {
  name: "Rainbow Servant",
  description: "Individuals who have discovered and studied the sacred knowledge within the hidden couatl temples are called rainbow servants.",
  hd: 4, levels: 10, skillPoints: 2,
  bab: "poor",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: [
    "Concentration",
    "Craft",
    "Diplomacy",
    "Knowledge (Arcana)",
    "Knowledge (The Planes)",
    "Profession",
    "Sense Motive",
    "Spellcraft",
  ],
  requirements: [
    gte("skills.knowledgearcana.rank", 4),
    gte("spellcasting.arcane", 3),
    or(
      eqStr("identity.beliefs.alignment", "Lawful Good"),
      eqStr("identity.beliefs.alignment", "Neutral Good"),
      eqStr("identity.beliefs.alignment", "Chaotic Good"),
      eqStr("identity.beliefs.alignment", "Lawful Neutral"),
      eqStr("identity.beliefs.alignment", "True Neutral"),
      eqStr("identity.beliefs.alignment", "Chaotic Neutral"),
    ),
  ],
  casterLevelAdvancement: { type: "arcane", levels: [2, 3, 5, 6, 8, 9] },
  classFeatureAptitude: "Rainbow Servant Class Feature",
  classFeatures: [
    [1, "Detect Evil (Rainbow Servant)"],
    [1, "Extra Domain (Good) (Rainbow Servant)"],
    [1, "Spells per Day/Spells Known (Rainbow Servant)"],
    [1, "Weapon and Armor Proficiency (Rainbow Servant)"],
    [4, "Extra Domain (Air) (Rainbow Servant)"],
    [4, "Grow Wings (Rainbow Servant)"],
    [7, "Detect Chaos (Rainbow Servant)"],
    [7, "Extra Domain (Law) (Rainbow Servant)"],
    [10, "Cleric Spell Access (Rainbow Servant)"],
    [10, "Detect Thoughts (Rainbow Servant)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
