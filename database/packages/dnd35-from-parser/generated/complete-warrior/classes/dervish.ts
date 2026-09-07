import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const DERVISH: ClassSeed = {
  name: "Dervish",
  description: "The dervish is the embodiment of swiftness, agility, and reckless fury in combat.",
  hd: 10, levels: 10, skillPoints: 4,
  bab: "good",
  saves: { fortitude: "poor", reflex: "good", will: "good" },
  classSkills: ["Balance", "Craft", "Escape Artist", "Jump", "Listen", "Perform", "Profession", "Swim", "Tumble"],
  requirements: [
    gte("combat.bab", 5),
    gte("skills.perform.rank", 3),
    gte("skills.tumble.rank", 3),
    eq("feats.combatexpertise.possessed"),
    eq("feats.dodge.possessed"),
    eq("feats.mobility.possessed"),
    eq("feats.weaponfocus.*.possessed"),
  ],
  classFeatureAptitude: "Dervish Class Feature",
  classFeatures: [
    [1, "AC Bonus (Dervish)"],
    [1, "Dervish Dance (Dervish)"],
    [1, "Movement Mastery (Dervish)"],
    [1, "Slashing Blades (Dervish)"],
    [1, "Weapon and Armor Proficiency (Dervish)"],
    [2, "Fast Movement (Dervish)"],
    [2, "Fast Movement + (Dervish)"],
    [3, "Dervish Dance (Dervish)"],
    [4, "Dance of Death (Dervish)"],
    [5, "Dervish Dance (Dervish)"],
    [5, "Fast Movement (Dervish)"],
    [6, "Improved Reaction (Dervish)"],
    [7, "Dervish Dance (Dervish)"],
    [7, "Elaborate Parry (Dervish)"],
    [8, "Fast Movement (Dervish)"],
    [9, "Dervish Dance (Dervish)"],
    [9, "Tireless Dance (Dervish)"],
    [10, "A Thousand Cuts (Dervish)"],
  ],
  freeFeats: [
    [3, "Spring Attack", "Dervish Class Feature"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
