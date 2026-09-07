import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const PIOUS_TEMPLAR: ClassSeed = {
  name: "Pious Templar",
  description: "Dedicated to safeguarding a holy site, the pious templar is a divine warrior who receives supernatural combat ability and exceptional resilience from her patron deity.",
  hd: 10, levels: 10, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "good" },
  classSkills: [
    "Concentration",
    "Craft",
    "Heal",
    "Intimidate",
    "Knowledge (Religion)",
    "Profession",
    "Sense Motive",
  ],
  requirements: [
    gte("combat.bab", 5),
    gte("skills.knowledgereligion.rank", 4),
    eq("feats.truebeliever.possessed"),
    eq("feats.weaponfocus.*.possessed"),
  ],
  classFeatureAptitude: "Pious Templar Class Feature",
  classFeatures: [
    [1, "Mettle (Pious Templar)"],
    [1, "Spells per Day (Pious Templar)"],
    [1, "Weapon and Armor Proficiency (Pious Templar)"],
    [2, "Smite (Pious Templar)"],
    [3, "Damage Reduction 1/? (Pious Templar)"],
    [3, "Weapon Specialization (Pious Templar)"],
    [4, "Bonus Feat (Pious Templar)"],
    [6, "Smite (Pious Templar)"],
    [7, "Damage Reduction 2/? (Pious Templar)"],
    [8, "Bonus Feat (Pious Templar)"],
    [10, "Smite (Pious Templar)"],
  ],
  bonusSpellAbility: "Wisdom",
  casterType: "Divine",
  spells: {
    slug: "pioustemplarspells",
    perDay: [
      [0],
      [1, 0],
      [1, 1],
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
  aptitudePicks: [
    { levels: [4, 8], target: "aptitudes.fighterbonusfeat.allowed" },
  ],
};

// TODO: No modifiers defined — review if this class needs any
