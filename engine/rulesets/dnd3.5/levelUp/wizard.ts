import type { RulesWord } from "@/engine/core/module/index.ts";

/**
 * What 3.5's level steps say in their own words: the ability increase's (its word, what its step asks, and what one adds
 * to its ability), the skill points' (what a point buys, a cheaper row's name and short header, and its review's title),
 * and a grant's note when it takes no slot of its pool.
 */
interface LevelWizardWords {
  abilityIncrease: { amount: number; prompt: string; word: RulesWord };
  freeGrantNote: string;
  pointSpend: { favored: string; favoredShort: string; review: string; unit: RulesWord };
}

/**
 * What 3.5's level steps show in its own words: an ability increase every fourth level, a point to one ability, skill
 * points that buy ranks (a class skill's cheaper), and a pool's grant a class ability.
 */
export const LEVEL_WIZARD: LevelWizardWords = {
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
