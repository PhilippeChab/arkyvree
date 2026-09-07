import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const ELDRITCH_KNIGHT: ClassSeed = {
  name: "Eldritch Knight",
  description: "The eldritch knight pursues mastery of both swordplay and arcane magic in equal measure, becoming a highly adaptable warrior-spellcaster.",
  hd: 6, levels: 10, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: [
    "Concentration",
    "Craft",
    "Decipher Script",
    "Jump",
    "Knowledge (Arcana)",
    "Knowledge (Nobility and Royalty)",
    "Ride",
    "Sense Motive",
    "Spellcraft",
    "Swim",
  ],
  requirements: [
    gte("spellcasting.arcane", 3),
    eq("feats.martialweaponproficiency.possessed"),
  ],
  casterLevelAdvancement: { type: "arcane", levels: [2, 3, 4, 5, 6, 7, 8, 9, 10] },
  classFeatureAptitude: "Eldritch Knight Class Feature",
  classFeatures: [
    [1, "Bonus Feat (Eldritch Knight)"],
    [1, "Spells per Day (Eldritch Knight)"],
    [1, "Weapon and Armor Proficiency (Eldritch Knight)"],
  ],
  aptitudePicks: [
    { levels: [1], target: "aptitudes.fighterbonusfeat.allowed" },
  ],
};

// TODO: No modifiers defined — review if this class needs any
