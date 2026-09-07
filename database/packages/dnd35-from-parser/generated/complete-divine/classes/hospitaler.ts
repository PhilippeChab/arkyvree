import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const HOSPITALER: ClassSeed = {
  name: "Hospitaler",
  description: "Hospitalers are militant protectors bound by vows of poverty and obedience, dedicated to safeguarding those under their charge.",
  hd: 8, levels: 10, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: [
    "Concentration",
    "Craft",
    "Diplomacy",
    "Handle Animal",
    "Heal",
    "Knowledge (Religion)",
    "Profession",
    "Ride",
  ],
  requirements: [
    gte("combat.bab", 5),
    gte("skills.handleanimal.rank", 5),
    gte("skills.ride.rank", 5),
    eq("feats.mountedcombat.possessed"),
    eq("feats.ridebyattack.possessed"),
    gte("spellcasting.divine", 1),
    or(
      eqStr("identity.beliefs.alignment", "Lawful Good"),
      eqStr("identity.beliefs.alignment", "Lawful Neutral"),
      eqStr("identity.beliefs.alignment", "Lawful Evil"),
      eqStr("identity.beliefs.alignment", "Neutral Good"),
      eqStr("identity.beliefs.alignment", "True Neutral"),
      eqStr("identity.beliefs.alignment", "Neutral Evil"),
    ),
  ],
  casterLevelAdvancement: { type: "divine", levels: [2, 3, 4, 6, 7, 8, 10] },
  classFeatureAptitude: "Hospitaler Class Feature",
  classFeatures: [
    [1, "Bonus Feat (Hospitaler)"],
    [1, "Lay on Hands (Hospitaler)"],
    [1, "Spells per Day/Spells Known (Hospitaler)"],
    [1, "Weapon and Armor Proficiency (Hospitaler)"],
    [3, "Remove Disease (Hospitaler)"],
    [5, "Bonus Feat (Hospitaler)"],
    [7, "Remove Disease (Hospitaler)"],
    [9, "Bonus Feat (Hospitaler)"],
  ],
  aptitudePicks: [
    { levels: [1, 5, 9], target: "aptitudes.fighterbonusfeat.allowed" },
  ],
};

// TODO: No modifiers defined — review if this class needs any
