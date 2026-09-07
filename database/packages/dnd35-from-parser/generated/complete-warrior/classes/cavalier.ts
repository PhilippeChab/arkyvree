import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const CAVALIER: ClassSeed = {
  name: "Cavalier",
  description: "The cavalier embodies the pinnacle of mounted combat, serving as the archetypal armored knight astride a warhorse.",
  hd: 10, levels: 10, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "good" },
  classSkills: [
    "Diplomacy",
    "Handle Animal",
    "Intimidate",
    "Knowledge (Nobility and Royalty)",
    "Profession",
    "Ride",
  ],
  requirements: [
    gte("combat.bab", 8),
    gte("skills.handleanimal.rank", 4),
    gte("skills.knowledgenobilityandroyalty.rank", 4),
    gte("skills.ride.rank", 6),
    eq("feats.spiritedcharge.possessed"),
    eq("feats.weaponfocuslance.possessed"),
    eq("feats.mountedcombat.possessed"),
    eq("feats.ridebyattack.possessed"),
    or(eqStr("identity.beliefs.alignment", "Lawful Good"), eqStr("identity.beliefs.alignment", "Lawful Neutral"), eqStr("identity.beliefs.alignment", "Lawful Evil")),
  ],
  classFeatureAptitude: "Cavalier Class Feature",
  classFeatures: [
    [1, "Courtly Knowledge (Cavalier)"],
    [1, "Mounted Weapon Bonus (Lance) (Cavalier)"],
    [1, "Ride Bonus (Cavalier)"],
    [1, "Special Mount (Cavalier)"],
    [1, "Weapon and Armor Proficiency (Cavalier)"],
    [2, "Deadly Charge (Cavalier)"],
    [2, "Mounted Weapon Bonus (Sword) (Cavalier)"],
    [3, "Burst of Speed (Cavalier)"],
    [4, "Deadly Charge (Cavalier)"],
    [4, "Ride Bonus (Cavalier)"],
    [5, "Mounted Weapon Bonus (Lance) (Cavalier)"],
    [6, "Deadly Charge (Cavalier)"],
    [6, "Full Mounted Attack (Cavalier)"],
    [6, "Mounted Weapon Bonus (Sword) (Cavalier)"],
    [7, "Ride Bonus (Cavalier)"],
    [8, "Deadly Charge (Cavalier)"],
    [9, "Mounted Weapon Bonus (Lance) (Cavalier)"],
    [9, "Ride Bonus (Cavalier)"],
    [10, "Mounted Weapon Bonus (Sword) (Cavalier)"],
    [10, "Unstoppable Charge (Cavalier)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
