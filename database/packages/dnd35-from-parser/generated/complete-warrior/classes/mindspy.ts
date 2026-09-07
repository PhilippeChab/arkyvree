import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const MINDSPY: ClassSeed = {
  name: "Mindspy",
  description: "A mindspy uses telepathic perception to predict her opponents' actions an instant before they occur.",
  hd: 8, levels: 5, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: ["Bluff", "Concentration", "Craft", "Intimidate", "Profession", "Sense Motive"],
  requirements: [
    gte("combat.bab", 3),
    gte("skills.concentration.rank", 8),
    or(gte("spellcasting.arcane", 1), gte("spellcasting.divine", 1)),
  ],
  classFeatureAptitude: "Mindspy Class Feature",
  classFeatures: [
    [1, "Anticipate (Mindspy)"],
    [1, "Combat Telepathy (Mindspy)"],
    [1, "Spherical Detect Thoughts (Mindspy)"],
    [1, "Weapon and Armor Proficiency (Mindspy)"],
    [2, "Faster Mindscan (Mindspy)"],
    [3, "Multiple Surface Thoughts (Mindspy)"],
    [4, "Instant Mindscan (Mindspy)"],
    [5, "Multiple Surface Thoughts (Mindspy)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
