import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const CLOAKED_DANCER: ClassSeed = {
  name: "Cloaked Dancer",
  description: "The cloaked dancer dances into the hearts and minds of her audience, beguiling those around her with boundless charm and careful dance moves, leaving her victims in a state of ecstasy even as she kills them.",
  hd: 6, levels: 5, skillPoints: 6,
  bab: "medium",
  saves: { fortitude: "poor", reflex: "good", will: "poor" },
  classSkills: [
    "Appraise",
    "Balance",
    "Bluff",
    "Climb",
    "Concentration",
    "Craft",
    "Diplomacy",
    "Disguise",
    "Escape Artist",
    "Gather Information",
    "Jump",
    "Perform",
    "Profession",
    "Sense Motive",
    "Sleight of Hand",
    "Speak Language",
    "Swim",
    "Tumble",
    "Use Magic Device",
    "Use Rope",
  ],
  requirements: [
    gte("skills.hide.rank", 5),
    gte("skills.perform.rank", 10),
    gte("skills.sleightofhand.rank", 5),
  ],
  casterLevelAdvancement: { type: "arcane", levels: [2, 4] },
  classFeatureAptitude: "Cloaked Dancer Class Feature",
  classFeatures: [
    [1, "Enchanting Dance (Beguiling Dance) (Cloaked Dancer)"],
    [2, "Surprise Strike (Cloaked Dancer)"],
    [3, "Enchanting Dance (Wearying Dance) (Cloaked Dancer)"],
    [4, "Surprise Strike (Cloaked Dancer)"],
    [5, "Enchanting Dance (Frightful Dance) (Cloaked Dancer)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
