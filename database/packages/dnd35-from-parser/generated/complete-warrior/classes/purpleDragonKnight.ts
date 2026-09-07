import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const PURPLE_DRAGON_KNIGHT: ClassSeed = {
  name: "Purple Dragon Knight",
  description: "Purple Dragon knights hone exceptional talents for commanding and coordinating military forces in the field.",
  hd: 10, levels: 5, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: ["Climb", "Diplomacy", "Handle Animal", "Intimidate", "Jump", "Knowledge (Local)", "Ride", "Swim"],
  requirements: [
    gte("combat.bab", 5),
    or(gte("skills.diplomacy.rank", 1), gte("skills.intimidate.rank", 1)),
    gte("skills.listen.rank", 2),
    gte("skills.ride.rank", 2),
    gte("skills.spot.rank", 2),
    eq("feats.mountedcombat.possessed"),
    eq("feats.negotiator.possessed"),
    or(
      eqStr("identity.beliefs.alignment", "Lawful Good"),
      eqStr("identity.beliefs.alignment", "Neutral Good"),
      eqStr("identity.beliefs.alignment", "Lawful Neutral"),
      eqStr("identity.beliefs.alignment", "True Neutral"),
    ),
  ],
  classFeatureAptitude: "Purple Dragon Knight Class Feature",
  classFeatures: [
    [1, "Heroic Shield (Purple Dragon Knight)"],
    [1, "Rallying Cry (Purple Dragon Knight)"],
    [1, "Weapon and Armor Proficiency (Purple Dragon Knight)"],
    [2, "Inspire Courage (Purple Dragon Knight)"],
    [3, "Fear (Purple Dragon Knight)"],
    [4, "Inspire Courage (Purple Dragon Knight)"],
    [4, "Oath of Wrath (Purple Dragon Knight)"],
    [5, "Final Stand (Purple Dragon Knight)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
