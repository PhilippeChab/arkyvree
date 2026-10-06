/**
 * To review:
 * - Animal companion large enough to serve as a mount, or a paladin's special mount.
 * - No modifiers defined — review if this class needs any
 */

import type { ClassSeed } from "@/database/packages/dnd35/content/classes/types.ts";
import { eq, gte } from "@/database/packages/dnd35/content/customization/requirements.ts";

export const WILD_PLAINS_OUTRIDER: ClassSeed = {
  name: "Wild Plains Outrider",
  description: "Wild plains outriders work tirelessly to keep the plains as safe as such remote places can be.",
  hd: 8,
  levels: 3,
  skillPoints: 4,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: [
    "Balance",
    "Handle Animal",
    "Jump",
    "Knowledge (Nature)",
    "Listen",
    "Move Silently",
    "Ride",
    "Spot",
    "Survival",
    "Swim",
  ],
  requirements: [gte("skills.ride.rank", 9), eq("feats.mountedcombat.possessed"), eq("feats.track.possessed")],
  classFeatureAptitude: "Wild Plains Outrider Class Feature",
  classFeatures: [
    [1, "Animal Companion/special Mount (Wild Plains Outrider)"],
    [1, "Ride Bonus (Wild Plains Outrider)"],
    [1, "Weapon and Armor Proficiency (Wild Plains Outrider)"],
    [1, "Wild Plains Stalker (Wild Plains Outrider)"],
    [2, "Wild Plains Swiftness (Wild Plains Outrider)"],
    [3, "Wild Plains Offensive (Wild Plains Outrider)"],
  ],
};
