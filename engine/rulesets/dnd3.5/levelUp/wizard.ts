import type { LevelWizardDescription } from "@/engine/core/module/index.ts";

/**
 * What 3.5's level wizard shows in its own words: an ability increase every fourth level, a point to one ability, skill points that buy ranks (a class
 * skill's cheaper), and a pool's grant a class ability.
 */
export const LEVEL_WIZARD: LevelWizardDescription = {
  abilityIncrease: {
    amount: 1,
    prompt: "Select an ability to increase",
    word: { many: "Ability Increases", one: "Ability Increase" },
  },
  freeGrantNote: "class ability",
  pointSpend: {
    favored: "Class Skill",
    favoredShort: "Class",
    review: "Skill Improvements",
    unit: { many: "Ranks", one: "Rank" },
  },
};
