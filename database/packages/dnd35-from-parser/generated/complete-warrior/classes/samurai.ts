import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eqStr, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const SAMURAI: ClassSeed = {
  name: "Samurai",
  description: "Trained to fight with their paired katana and wakizashi at the same time, samurai rival fighters in close combat effectiveness but possess a narrower range of martial techniques.",
  hd: 10, levels: 20, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: [
    "Concentration",
    "Craft",
    "Diplomacy",
    "Intimidate",
    "Knowledge (Nobility and Royalty)",
    "Ride",
    "Sense Motive",
  ],
  requirements: [
    or(eqStr("identity.beliefs.alignment", "Lawful Good"), eqStr("identity.beliefs.alignment", "Lawful Neutral"), eqStr("identity.beliefs.alignment", "Lawful Evil")),
  ],
  classFeatureAptitude: "Samurai Class Feature",
  classFeatures: [
    [1, "Daisho Proficiency (Samurai)"],
    [1, "Weapon and Armor Proficiency (Samurai)"],
    [2, "Two Swords as One (Samurai)"],
    [3, "Kiai Smite (Samurai)"],
    [5, "Iaijutsu Master (Samurai)"],
    [6, "Staredown (Samurai)"],
    [7, "Kiai Smite (Samurai)"],
    [10, "Mass Staredown (Samurai)"],
    [11, "Improved Two Swords as One (Samurai)"],
    [12, "Kiai Smite (Samurai)"],
    [14, "Improved Staredown (Samurai)"],
    [16, "Greater Two Swords as One (Samurai)"],
    [17, "Kiai Smite (Samurai)"],
    [20, "Frightful Presence (Samurai)"],
  ],
  freeFeats: [
    [8, "Improved Initiative", "Samurai Class Feature"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
