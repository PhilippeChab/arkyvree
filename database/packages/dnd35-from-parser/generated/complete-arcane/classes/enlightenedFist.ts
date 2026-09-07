import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const ENLIGHTENED_FIST: ClassSeed = {
  name: "Enlightened Fist",
  description: "Enlightened fists master the use of touch spells, creating new forms of combat with their fists.",
  hd: 8, levels: 10, skillPoints: 4,
  bab: "medium",
  saves: { fortitude: "poor", reflex: "good", will: "good" },
  classSkills: [
    "Balance",
    "Climb",
    "Concentration",
    "Craft",
    "Escape Artist",
    "Hide",
    "Jump",
    "Knowledge (Arcana)",
    "Knowledge (Religion)",
    "Listen",
    "Move Silently",
    "Profession",
    "Spellcraft",
    "Spot",
    "Swim",
    "Tumble",
  ],
  requirements: [
    gte("skills.concentration.rank", 8),
    gte("skills.knowledgearcana.rank", 5),
    gte("skills.spellcraft.rank", 5),
    eq("feats.combatcasting.possessed"),
    eq("feats.improvedunarmedstrike.possessed"),
  ],
  casterLevelAdvancement: { type: "arcane", levels: [2, 3, 4, 5, 7, 8, 9, 10] },
  classFeatureAptitude: "Enlightened Fist Class Feature",
  classFeatures: [
    [1, "Ki Strike (Enlightened Fist)"],
    [1, "Monk Abilities (Enlightened Fist)"],
    [1, "Spells per Day/Spells Known (Enlightened Fist)"],
    [1, "Weapon and Armor Proficiency (Enlightened Fist)"],
    [2, "Fist of Energy (Enlightened Fist)"],
    [3, "Arcane Fist (Enlightened Fist)"],
    [5, "Arcane Rejuvination (Enlightened Fist)"],
    [6, "Fist of Energy (Burst) (Enlightened Fist)"],
    [6, "Fist of Energy (Enlightened Fist)"],
    [7, "Hold Ray (Enlightened Fist)"],
    [9, "Diamond Soul (Enlightened Fist)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
