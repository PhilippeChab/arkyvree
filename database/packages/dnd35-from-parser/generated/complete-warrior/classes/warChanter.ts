import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const WAR_CHANTER: ClassSeed = {
  name: "War Chanter",
  description: "The war chanter wields musical power as a weapon on the battlefield, sweeping up allies and enemies alike in the surge of her performance.",
  hd: 8, levels: 10, skillPoints: 4,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: [
    "Balance",
    "Climb",
    "Concentration",
    "Craft",
    "Diplomacy",
    "Escape Artist",
    "Gather Information",
    "Intimidate",
    "Jump",
    "Perform",
    "Profession",
    "Sense Motive",
    "Swim",
  ],
  requirements: [
    gte("combat.bab", 4),
    gte("skills.perform.rank", 6),
    eq("feats.combatexpertise.possessed"),
    eq("feats.weaponfocus.possessed"),
    or(
      eqStr("identity.beliefs.alignment", "Neutral Good"),
      eqStr("identity.beliefs.alignment", "True Neutral"),
      eqStr("identity.beliefs.alignment", "Neutral Evil"),
      eqStr("identity.beliefs.alignment", "Chaotic Good"),
      eqStr("identity.beliefs.alignment", "Chaotic Neutral"),
      eqStr("identity.beliefs.alignment", "Chaotic Evil"),
    ),
    eq("feats.inspirecourage.possessed"),
  ],
  classFeatureAptitude: "War Chanter Class Feature",
  classFeatures: [
    [1, "Inspire Toughness (War Chanter)"],
    [1, "War Chanter Music (War Chanter)"],
    [1, "Weapon and Armor Proficiency (War Chanter)"],
    [3, "Inspire Recklessness (War Chanter)"],
    [5, "Combine Songs (War Chanter)"],
    [7, "Inspire Awe (War Chanter)"],
    [8, "Singing Shout (War Chanter)"],
    [10, "Inspire Legion (War Chanter)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
