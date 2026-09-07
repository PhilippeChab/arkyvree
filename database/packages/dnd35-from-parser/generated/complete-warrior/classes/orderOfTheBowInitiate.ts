import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const ORDER_OF_THE_BOW_INITIATE: ClassSeed = {
  name: "Order of the Bow Initiate",
  description: "Through the contemplative discipline known as the Way of the Bow, an archer hones his accuracy, mental focus, and inner awareness.",
  hd: 8, levels: 10, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "poor", reflex: "good", will: "good" },
  classSkills: ["Climb", "Craft", "Knowledge (Religion)", "Ride", "Spot", "Swim"],
  requirements: [
    gte("combat.bab", 5),
    gte("skills.craft.rank", 5),
    gte("skills.knowledgereligion.rank", 2),
    eq("feats.pointblankshot.possessed"),
    eq("feats.preciseshot.possessed"),
    eq("feats.rapidshot.possessed"),
    eq("feats.weaponfocuslongbow.possessed"),
    eq("feats.shortbow.possessed"),
    eq("feats.orcompositeversionofeither.possessed"),
  ],
  classFeatureAptitude: "Order of the Bow Initiate Class Feature",
  classFeatures: [
    [1, "Ranged Precision (Order of the Bow Initiate)"],
    [1, "Weapon and Armor Proficiency (Order of the Bow Initiate)"],
    [2, "Close Combat Shot (Order of the Bow Initiate)"],
    [3, "Ranged Precision (Order of the Bow Initiate)"],
    [4, "Greater Weapon Focus (Order of the Bow Initiate)"],
    [5, "Ranged Precision (Order of the Bow Initiate)"],
    [6, "Sharp-shooting (Order of the Bow Initiate)"],
    [7, "Ranged Precision (Order of the Bow Initiate)"],
    [9, "Ranged Precision (Order of the Bow Initiate)"],
    [10, "Extended Precision (Order of the Bow Initiate)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
