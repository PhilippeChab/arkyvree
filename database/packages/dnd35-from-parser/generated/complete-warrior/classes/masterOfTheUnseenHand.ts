import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const MASTER_OF_THE_UNSEEN_HAND: ClassSeed = {
  name: "Master of the Unseen Hand",
  description: "Those who pursue this path revel in the power of telekinetic force, using invisible energy to smash opponents, hurl heavy objects skyward, and strip weapons from foes through sheer mental will.",
  hd: 4, levels: 5, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: ["Concentration", "Craft", "Intimidate", "Knowledge (Arcana)", "Profession", "Spellcraft"],
  requirements: [
    gte("skills.concentration.rank", 8),
  ],
  classFeatureAptitude: "Master of the Unseen Hand Class Feature",
  classFeatures: [
    [1, "Improved Caster Level (Master of the Unseen Hand)"],
    [1, "Versatile Telekinesis (Master of the Unseen Hand)"],
    [1, "Weapon and Armor Proficiency (Master of the Unseen Hand)"],
    [2, "Sustained Concentration (Master of the Unseen Hand)"],
    [2, "Telekinetic Wielder (Master of the Unseen Hand)"],
    [3, "Full Attack Telekinesis (Master of the Unseen Hand)"],
    [4, "Improved Violent Thrust (Master of the Unseen Hand)"],
    [4, "Telekinetic Flight (Master of the Unseen Hand)"],
    [5, "Fling Skyward (Master of the Unseen Hand)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
