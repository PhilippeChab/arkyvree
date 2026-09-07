import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";

export const FIGHTER: ClassSeed = {
  name: "Fighter",
  description: "Fighters encompass a wide range of martial archetypes - from noble knights and conquering warlords to hardened sellswords, royal champions, seasoned infantry, and ruthless brigand leaders. They may serve as valiant protectors of the helpless, merciless raiders, or bold fortune-seekers. Among their ranks are some of the most honorable individuals in the realm, ready to lay down their lives for a just cause, while others are utterly ruthless, willing to kill for coin or mere amusement. Outside of adventuring, fighters often work as soldiers, sentries, personal guards, arena champions, or muscle for criminal organizations. A fighter on the road might refer to themselves as a warrior, hired blade, enforcer, or simply an adventurer. For most fighters, perilous quests, raids, and hazardous missions are simply their livelihood. Some serve patrons who provide steady pay, while others operate more like treasure hunters, accepting enormous risks in pursuit of a major payoff. Certain fighters take a more altruistic path, employing their battle prowess to shield vulnerable folk who cannot protect themselves. Regardless of what first drew them to the profession, fighters frequently come to live for the excitement of battle and exploration. No other class matches the fighter's overall combat versatility. Fighters possess training with every standard weapon and all forms of armor. Beyond their general martial competence, each fighter cultivates their own areas of expertise. One fighter might excel with particular weapons, while another may have drilled extensively in specific tactical maneuvers. As fighters accumulate experience, they gain increasing opportunities to hone their combat techniques. Their dedication to martial discipline allows them to master even the most demanding fighting methods with relative speed.",
  hd: 10, levels: 20, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: ["Climb", "Craft", "Handle Animal", "Intimidate", "Jump", "Ride", "Swim"],
  classFeatureAptitude: "Fighter Class Feature",
  classFeatures: [
    [1, "Bonus Feat (Fighter)"],
    [1, "Weapon and Armor Proficiency (Fighter)"],
    [2, "Bonus Feat (Fighter)"],
    [4, "Bonus Feat (Fighter)"],
    [6, "Bonus Feat (Fighter)"],
    [8, "Bonus Feat (Fighter)"],
    [10, "Bonus Feat (Fighter)"],
    [12, "Bonus Feat (Fighter)"],
    [14, "Bonus Feat (Fighter)"],
    [16, "Bonus Feat (Fighter)"],
    [18, "Bonus Feat (Fighter)"],
    [20, "Bonus Feat (Fighter)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
