import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const DRUNKEN_MASTER: ClassSeed = {
  name: "Drunken Master",
  description: "Through erratic, swaying movements that mimic intoxication, practitioners of this fighting style evade incoming attacks with deceptive agility.",
  hd: 8, levels: 10, skillPoints: 4,
  bab: "medium",
  saves: { fortitude: "good", reflex: "good", will: "poor" },
  classSkills: [
    "Balance",
    "Bluff",
    "Climb",
    "Craft",
    "Escape Artist",
    "Hide",
    "Jump",
    "Listen",
    "Move Silently",
    "Perform",
    "Profession",
    "Swim",
    "Tumble",
  ],
  requirements: [
    gte("skills.tumble.rank", 8),
    eq("feats.dodge.possessed"),
    eq("feats.greatfortitude.possessed"),
    eq("feats.improvedunarmedstrikeormonksunarmedstrikeability.possessed"),
    eq("feats.flurryofblows.possessed"),
  ],
  classFeatureAptitude: "Drunken Master Class Feature",
  classFeatures: [
    [1, "Drink Like a Demon (Drunken Master)"],
    [1, "Improvised Weapons (Drunken Master)"],
    [1, "Weapon and Armor Proficiency (Drunken Master)"],
    [2, "Stagger (Drunken Master)"],
    [3, "Swaying Waist (Drunken Master)"],
    [4, "AC Bonus (Drunken Master)"],
    [4, "Improved Improvised Weapons (Drunken Master)"],
    [5, "Greater Improvised Weapons (Drunken Master)"],
    [8, "For Medicinal Purposes (Drunken Master)"],
    [9, "AC Bonus (Drunken Master)"],
    [9, "Corkscrew Rush (Drunken Master)"],
    [9, "Superior Improvised Weapons (Drunken Master)"],
    [10, "Breath of Flame (Drunken Master)"],
  ],
  freeFeats: [
    [6, "Improved Feint", "Drunken Master Class Feature"],
    [7, "Improved Grapple", "Drunken Master Class Feature"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
