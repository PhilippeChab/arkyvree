import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";

export const SWASHBUCKLER: ClassSeed = {
  name: "Swashbuckler",
  description: "The swashbuckler represents the ideal of boldness and flair in combat.",
  hd: 10, levels: 20, skillPoints: 4,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: [
    "Balance",
    "Bluff",
    "Climb",
    "Craft",
    "Diplomacy",
    "Escape Artist",
    "Jump",
    "Profession",
    "Sense Motive",
    "Swim",
    "Tumble",
    "Use Rope",
  ],
  classFeatureAptitude: "Swashbuckler Class Feature",
  classFeatures: [
    [1, "Weapon and Armor Proficiency (Swashbuckler)"],
    [2, "Grace (Swashbuckler)"],
    [3, "Insightful Strike (Swashbuckler)"],
    [5, "Dodge Bonus (Swashbuckler)"],
    [7, "Acrobatic Charge (Swashbuckler)"],
    [8, "Improved Flanking (Swashbuckler)"],
    [10, "Dodge Bonus (Swashbuckler)"],
    [11, "Grace (Swashbuckler)"],
    [11, "Lucky (Swashbuckler)"],
    [13, "Acrobatic Skill Mastery (Swashbuckler)"],
    [14, "Weakening Critical (Swashbuckler)"],
    [15, "Dodge Bonus (Swashbuckler)"],
    [17, "Slippery Mind (Swashbuckler)"],
    [19, "Wounding Critical (Swashbuckler)"],
    [20, "Dodge Bonus (Swashbuckler)"],
    [20, "Grace (Swashbuckler)"],
  ],
  freeFeats: [
    [1, "Weapon Finesse", "Swashbuckler Class Feature"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
