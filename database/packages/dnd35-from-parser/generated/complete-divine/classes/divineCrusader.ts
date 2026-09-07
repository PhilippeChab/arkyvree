import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const DIVINE_CRUSADER: ClassSeed = {
  name: "Divine Crusader",
  description: "A divine crusader is a holy warrior wholly devoted to a single deity, channeling that god's power through unwavering faith and martial prowess.",
  hd: 8, levels: 10, skillPoints: 2,
  bab: "medium",
  saves: { fortitude: "good", reflex: "poor", will: "good" },
  classSkills: [
    "Climb",
    "Concentration",
    "Craft",
    "Diplomacy",
    "Intimidate",
    "Jump",
    "Knowledge (Religion)",
    "Ride",
    "Swim",
  ],
  requirements: [
    gte("combat.bab", 7),
    gte("skills.knowledgereligion.rank", 2),
    eq("feats.weaponfocus.*.possessed"),
  ],
  classFeatureAptitude: "Divine Crusader Class Feature",
  classFeatures: [
    [1, "Aura (Divine Crusader)"],
    [1, "Spells per Day (Divine Crusader)"],
    [1, "Weapon and Armor Proficiency (Divine Crusader)"],
    [3, "Resistance to Electricity 5 (Divine Crusader)"],
    [5, "Weapon Specialization (Divine Crusader)"],
    [6, "Resistance to Acid 5 (Divine Crusader)"],
    [7, "Darkvision (Divine Crusader)"],
    [9, "Resistance to Acid and Electricity 10 (Divine Crusader)"],
    [10, "Perfect Self (Divine Crusader)"],
  ],
  bonusSpellAbility: "Charisma",
  casterType: "Divine",
  spells: {
    slug: "divinecrusaderspells",
    perDay: [
      [0],
      [1, 0],
      [2, 1, 0],
      [2, 2, 1, 0],
      [3, 2, 2, 1, 0],
      [3, 3, 2, 2, 1, 0],
      [3, 3, 3, 2, 2, 1, 0],
      [3, 3, 3, 3, 2, 2, 1, 0],
      [3, 3, 3, 3, 3, 2, 2, 1, 0],
      [3, 3, 3, 3, 3, 3, 2, 2, 1],
    ],
    knowAll: true,
    noCantrips: true,
  },
};

// TODO: No modifiers defined — review if this class needs any
