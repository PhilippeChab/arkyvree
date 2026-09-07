import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const RONIN: ClassSeed = {
  name: "Ronin",
  description: "A ronin is a wandering warrior who has lost or abandoned his lord, yet still holds on to fragments of his previous way of life.",
  hd: 10, levels: 10, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: [
    "Bluff",
    "Craft",
    "Disguise",
    "Intimidate",
    "Knowledge (History)",
    "Knowledge (Nobility and Royalty)",
    "Ride",
    "Sense Motive",
  ],
  requirements: [
    gte("combat.bab", 6),
    eq("feats.exoticweaponproficiencybastardsword.possessed"),
    or(
      eqStr("identity.beliefs.alignment", "Neutral Good"),
      eqStr("identity.beliefs.alignment", "True Neutral"),
      eqStr("identity.beliefs.alignment", "Neutral Evil"),
      eqStr("identity.beliefs.alignment", "Chaotic Good"),
      eqStr("identity.beliefs.alignment", "Chaotic Neutral"),
      eqStr("identity.beliefs.alignment", "Chaotic Evil"),
    ),
  ],
  classFeatureAptitude: "Ronin Class Feature",
  classFeatures: [
    [1, "Infamy (Ronin)"],
    [1, "Sneak Attack (Ronin)"],
    [1, "Weapon and Armor Proficiency (Ronin)"],
    [2, "Banzai Charge (Ronin)"],
    [4, "Sneak Attack (Ronin)"],
    [5, "Bonus Feat (Ronin)"],
    [7, "Sneak Attack (Ronin)"],
    [9, "Bonus Feat (Ronin)"],
    [10, "Sneak Attack (Ronin)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
