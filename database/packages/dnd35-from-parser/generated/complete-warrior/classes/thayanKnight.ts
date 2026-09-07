import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const THAYAN_KNIGHT: ClassSeed = {
  name: "Thayan Knight",
  description: "Thayan knights are skilled swordfighters with knowledge of the arcane arts who serve as devoted protectors of the Red Wizards.",
  hd: 10, levels: 5, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: [
    "Bluff",
    "Climb",
    "Craft",
    "Gather Information",
    "Handle Animal",
    "Intimidate",
    "Jump",
    "Knowledge (Arcana)",
    "Knowledge (Local)",
    "Profession",
    "Ride",
    "Spot",
    "Swim",
  ],
  requirements: [
    gte("combat.bab", 5),
    gte("skills.intimidate.rank", 2),
    gte("skills.knowledgearcana.rank", 2),
    eq("feats.ironwill.possessed"),
    eq("feats.weaponfocuslongsword.possessed"),
    or(
      eqStr("identity.beliefs.alignment", "Lawful Neutral"),
      eqStr("identity.beliefs.alignment", "True Neutral"),
      eqStr("identity.beliefs.alignment", "Chaotic Neutral"),
      eqStr("identity.beliefs.alignment", "Lawful Evil"),
      eqStr("identity.beliefs.alignment", "Neutral Evil"),
      eqStr("identity.beliefs.alignment", "Chaotic Evil"),
    ),
    eqStr("identity.physiology.race.name", "Human"),
  ],
  classFeatureAptitude: "Thayan Knight Class Feature",
  classFeatures: [
    [1, "Horrors of Thay (Thayan Knight)"],
    [1, "Weapon and Armor Proficiency (Thayan Knight)"],
    [1, "Zulkir's Favor (Thayan Knight)"],
    [2, "Zulkir's Defender (Thayan Knight)"],
    [3, "Fighter Feat (Thayan Knight)"],
    [4, "Final Stand (Thayan Knight)"],
    [4, "Horrors of Thay (Thayan Knight)"],
    [5, "Zulkir's Champion (Thayan Knight)"],
  ],
  aptitudePicks: [
    { levels: [3], target: "aptitudes.fighterbonusfeat.allowed" },
  ],
};

// TODO: No modifiers defined — review if this class needs any
