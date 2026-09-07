import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const NIGHTSONG_ENFORCER: ClassSeed = {
  name: "Nightsong Enforcer",
  description: "The enforcers of the Nightsong Guild focus on the stealth-centered combat training that rogues usually learn; they forgo some of the sleight of hand or fast-talking aspects of being a thief. However, nightsong enforcers are not mere thugs. They are deadly opponents who strike from hidden positions and move silently behind their foes. When in battle, their goal is to eliminate their enemies, not to ?ght. Thus, they strike quickly from the shadows. They do not worry about honor or ?ghting fair, scof?ng at such ideals as childish. Rogues most often become nightsong enforcers, although bards, ?ghters, and urban rangers are also known to undertake the class. On occasion a wizard or sorcerer will endure the intensive training required to join the enforcers' ranks. When working with others, a nightsong enforcer is the linchpin. She is the very picture of ?delity when it comes to supporting teammates on a mission. It is common for an enforcer to lead a team composed of not only other enforcers, but ?ghters, spellcasters, or rogues.",
  hd: 8, levels: 10, skillPoints: 4,
  bab: "good",
  saves: { fortitude: "poor", reflex: "good", will: "poor" },
  classSkills: [
    "Balance",
    "Climb",
    "Disable Device",
    "Disguise",
    "Escape Artist",
    "Hide",
    "Intimidate",
    "Jump",
    "Listen",
    "Move Silently",
    "Open Lock",
    "Profession",
    "Ride",
    "Search",
    "Spot",
    "Swim",
    "Tumble",
  ],
  requirements: [
    gte("combat.bab", 5),
    gte("skills.hide.rank", 10),
    gte("skills.movesilently.rank", 10),
    eq("feats.improvedinitiative.possessed"),
  ],
  classFeatureAptitude: "Nightsong Enforcer Class Feature",
  classFeatures: [
    [1, "Sneak Attack (Nightsong Enforcer)"],
    [1, "Teamwork (Hear/see Allies) (Nightsong Enforcer)"],
    [1, "Weapon and Armor Proficiency (Nightsong Enforcer)"],
    [2, "Agility Training (Nightsong Enforcer)"],
    [3, "Skill Teamwork (Nightsong Enforcer)"],
    [4, "Sneak Attack (Nightsong Enforcer)"],
    [5, "Flanking Teamwork (Nightsong Enforcer)"],
    [6, "Opportunist (Nightsong Enforcer)"],
    [7, "Skill Teamwork (Nightsong Enforcer)"],
    [7, "Sneak Attack (Nightsong Enforcer)"],
    [8, "Improved Evasion (Nightsong Enforcer)"],
    [9, "Teamwork (Status) (Nightsong Enforcer)"],
    [10, "Sneak Attack (Nightsong Enforcer)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
