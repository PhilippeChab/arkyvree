import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const KENSAI: ClassSeed = {
  name: "Kensai",
  description: "The kensai achieves unity of physical prowess, mental discipline, martial skill, and inner resolve.",
  hd: 10, levels: 10, skillPoints: 4,
  bab: "medium",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: [
    "Balance",
    "Climb",
    "Concentration",
    "Craft",
    "Diplomacy",
    "Intimidate",
    "Jump",
    "Knowledge (Local)",
    "Knowledge (Nobility and Royalty)",
    "Ride",
    "Sense Motive",
  ],
  requirements: [
    gte("combat.bab", 5),
    gte("skills.concentration.rank", 5),
    gte("skills.diplomacy.rank", 5),
    gte("skills.ride.rank", 5),
    eq("feats.combatexpertise.possessed"),
    eq("feats.weaponfocus.*.possessed"),
    or(eqStr("identity.beliefs.alignment", "Lawful Good"), eqStr("identity.beliefs.alignment", "Lawful Neutral"), eqStr("identity.beliefs.alignment", "Lawful Evil")),
  ],
  classFeatureAptitude: "Kensai Class Feature",
  classFeatures: [
    [1, "Signature Weapon (Kensai)"],
    [1, "Weapon and Armor Proficiency (Kensai)"],
    [2, "Power Surge (Kensai)"],
    [4, "Ki Projection (Kensai)"],
    [5, "Withstand (Kensai)"],
    [7, "Ki Projection (Kensai)"],
    [8, "Instill (Kensai)"],
    [10, "Ki Warlord (Kensai)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
