import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const HUNTER_OF_THE_DEAD: ClassSeed = {
  name: "Hunter of the Dead",
  description: "A hunter of the dead devotes every waking moment to pursuing undead creatures, seeking out their hiding places and purging the world of their unholy taint.",
  hd: 8, levels: 10, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: ["Concentration", "Heal", "Knowledge (Religion)", "Profession", "Ride", "Search"],
  requirements: [
    gte("combat.bab", 5),
    gte("skills.knowledgereligion.rank", 5),
    or(
      eqStr("identity.beliefs.alignment", "Lawful Good"),
      eqStr("identity.beliefs.alignment", "Neutral Good"),
      eqStr("identity.beliefs.alignment", "Chaotic Good"),
      eqStr("identity.beliefs.alignment", "Lawful Neutral"),
      eqStr("identity.beliefs.alignment", "True Neutral"),
      eqStr("identity.beliefs.alignment", "Chaotic Neutral"),
    ),
    eq("feats.turnorrebukeundead.*.possessed"),
  ],
  classFeatureAptitude: "Hunter of the Dead Class Feature",
  classFeatures: [
    [1, "Detect Undead (Hunter of the Dead)"],
    [1, "Spells (Hunter of the Dead)"],
    [1, "Weapon and Armor Proficiency (Hunter of the Dead)"],
    [2, "Smite Undead (Hunter of the Dead)"],
    [3, "Spurn Death's Touch (Hunter of the Dead)"],
    [5, "True Death (Hunter of the Dead)"],
    [6, "Smite Undead (Hunter of the Dead)"],
    [8, "Positive Energy Burst (Hunter of the Dead)"],
    [10, "Sealed Life (Hunter of the Dead)"],
    [10, "Smite Undead (Hunter of the Dead)"],
  ],
  freeFeats: [
    [6, "Extra Turning", "Hunter of the Dead Class Feature"],
  ],
  bonusSpellAbility: "Wisdom",
  casterType: "Divine",
  spells: {
    slug: "hunterofthedeadspells",
    perDay: [
      [0],
      [1],
      [1, 0],
      [1, 1],
      [1, 1, 0],
      [1, 1, 1],
      [2, 1, 1, 0],
      [2, 1, 1, 1],
      [2, 2, 1, 1],
      [2, 2, 2, 1],
    ],
    knowAll: true,
    noCantrips: true,
  },
};

// TODO: No modifiers defined — review if this class needs any
