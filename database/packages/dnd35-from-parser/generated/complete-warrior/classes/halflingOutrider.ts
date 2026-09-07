import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const HALFLING_OUTRIDER: ClassSeed = {
  name: "Halfling Outrider",
  description: "Halfling outriders serve as skilled mounted sentinels, dedicated to alerting and safeguarding their communities against approaching threats.",
  hd: 8, levels: 10, skillPoints: 4,
  bab: "good",
  saves: { fortitude: "poor", reflex: "good", will: "poor" },
  classSkills: ["Handle Animal", "Listen", "Ride", "Spot", "Survival"],
  requirements: [
    gte("combat.bab", 5),
    gte("skills.listen.rank", 3),
    gte("skills.ride.rank", 6),
    gte("skills.spot.rank", 3),
    eq("feats.mountedcombat.possessed"),
    eq("feats.mountedarchery.possessed"),
    eqStr("identity.physiology.race.name", "Halfling"),
  ],
  classFeatureAptitude: "Halfling Outrider Class Feature",
  classFeatures: [
    [1, "AC Bonus (Halfling Outrider)"],
    [1, "Mount (Halfling Outrider)"],
    [1, "Ride Bonus (Halfling Outrider)"],
    [1, "Weapon and Armor Proficiency (Halfling Outrider)"],
    [2, "Defensive Riding (Halfling Outrider)"],
    [3, "Unbroken Charge (Halfling Outrider)"],
    [4, "Stand on Mount (Halfling Outrider)"],
    [5, "Leap From the Saddle (Halfling Outrider)"],
    [7, "Evasion (Halfling Outrider)"],
    [8, "Full Mounted Attack (Halfling Outrider)"],
    [10, "Quick Turn (Halfling Outrider)"],
  ],
  freeFeats: [
    [1, "Alertness", "Halfling Outrider Class Feature"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
