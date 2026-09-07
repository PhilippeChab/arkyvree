import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eqStr, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const SEEKER_OF_THE_MISTY_ISLE: ClassSeed = {
  name: "Seeker of the Misty Isle",
  description: "These devoted elven questers dedicate themselves to finding the lost elves rumored to dwell on the legendary Misty Isle.",
  hd: 8, levels: 10, skillPoints: 6,
  bab: "medium",
  saves: { fortitude: "good", reflex: "good", will: "poor" },
  classSkills: [
    "Balance",
    "Climb",
    "Concentration",
    "Craft",
    "Diplomacy",
    "Hide",
    "Jump",
    "Knowledge (Geography)",
    "Knowledge (Religion)",
    "Listen",
    "Move Silently",
    "Ride",
    "Speak Language",
    "Spellcraft",
    "Spot",
    "Survival",
  ],
  requirements: [
    gte("skills.knowledgereligion.rank", 4),
    gte("skills.survival.rank", 8),
    gte("spellcasting.divine", 2),
    eqStr("identity.physiology.race.name", "Elf"),
  ],
  casterLevelAdvancement: { type: "divine", levels: [1, 2, 3, 4, 6, 7, 8, 9] },
  classFeatureAptitude: "Seeker of the Misty Isle Class Feature",
  classFeatures: [
    [1, "Extra Domain (Travel) (Seeker of the Misty Isle)"],
    [1, "Spells per Day/Spells Known (Seeker of the Misty Isle)"],
    [1, "Weapon and Armor Proficiency (Seeker of the Misty Isle)"],
    [4, "Swiftfooted (Seeker of the Misty Isle)"],
    [5, "Corellon's Perception (Seeker of the Misty Isle)"],
    [5, "Surefooted (Seeker of the Misty Isle)"],
    [6, "Find the Path (Seeker of the Misty Isle)"],
    [7, "Extra Domain (Seeker of the Misty Isle)"],
    [9, "Arcane Sight (Seeker of the Misty Isle)"],
    [10, "Discern Location (Seeker of the Misty Isle)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
