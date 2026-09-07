import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const MASTER_OF_MASKS: ClassSeed = {
  name: "Master of Masks",
  description: "Wearer of a thousand faces, with an identity as fluid as that of a crowd of strangers, this thespian of possibilities decides what is real and what can be.",
  hd: 6, levels: 10, skillPoints: 4,
  bab: "poor",
  saves: { fortitude: "poor", reflex: "good", will: "good" },
  classSkills: ["Appraise", "Bluff", "Craft", "Disguise", "Forgery", "Perform", "Sleight of Hand", "Speak Language"],
  requirements: [
    gte("skills.bluff.rank", 8),
    gte("skills.disguise.rank", 8),
    gte("skills.perform.rank", 8),
  ],
  casterLevelAdvancement: { type: "any", levels: [2, 4, 7, 9] },
  classFeatureAptitude: "Master of Masks Class Feature",
  classFeatures: [
    [1, "Persona Masks (Master of Masks)"],
    [3, "Mask Specialist (Master of Masks)"],
    [5, "Many Faces (Master of Masks)"],
    [6, "Hidden Mask (Master of Masks)"],
    [8, "Many Faces (Master of Masks)"],
    [10, "Many Faces (Master of Masks)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
