import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const RAGE_MAGE: ClassSeed = {
  name: "Rage Mage",
  description: "Rage mages tap into the raw, instinctive essence of arcane power rather than relying on methodical, scholarly techniques of spellcasting.",
  hd: 8, levels: 10, skillPoints: 2,
  bab: "medium",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: ["Concentration", "Profession", "Spellcraft", "Survival"],
  requirements: [
    gte("combat.bab", 4),
    eq("feats.combatcasting.possessed"),
    gte("spellcasting.arcane", 2),
    or(
      eqStr("identity.beliefs.alignment", "Neutral Good"),
      eqStr("identity.beliefs.alignment", "True Neutral"),
      eqStr("identity.beliefs.alignment", "Neutral Evil"),
      eqStr("identity.beliefs.alignment", "Chaotic Good"),
      eqStr("identity.beliefs.alignment", "Chaotic Neutral"),
      eqStr("identity.beliefs.alignment", "Chaotic Evil"),
    ),
    eq("feats.rage.possessed"),
  ],
  casterLevelAdvancement: { type: "arcane", levels: [2, 4, 6, 8, 10] },
  classFeatureAptitude: "Rage Mage Class Feature",
  classFeatures: [
    [1, "Spell Rage (Rage Mage)"],
    [1, "Spells per Day (Rage Mage)"],
    [1, "Weapon and Armor Proficiency (Rage Mage)"],
    [2, "Overcome Spell Failure (Rage Mage)"],
    [3, "Rage +1 Use/day (Rage Mage)"],
    [5, "Spell Rage (Rage Mage)"],
    [7, "Spell Fury (Rage Mage)"],
    [8, "Rage +1 Use/day (Rage Mage)"],
    [9, "Tireless Rage (Rage Mage)"],
    [10, "Spell Rage (Rage Mage)"],
    [10, "Warrior Cry (Rage Mage)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
