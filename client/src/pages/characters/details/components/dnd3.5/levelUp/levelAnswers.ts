/**
 * 3.5's answers to its level wizards, in its own shape: each of its steps' by the name it lists it by (`abilities`,
 * `skills`, `feats`, `powers`) and its preview of Add Level's plan, as its steps read them; and what of them the
 * generic wizards keep their levels and picks by (`previewAnswers`, `stepAnswers`).
 */

import type { UseQueryResult } from "@tanstack/react-query";

import type { LevelPreview, StepAnswer } from "@/client/src/pages/characters/details/components/levelUp/index.ts";
import type { EditAnswers, PreviewAnswers } from "@/client/src/pages/characters/details/components/levelUpFactory.ts";

/** Edit Level's steps whose answers its picks are fitted by and its Next waits for, each asked at the edited level. */
interface EditedSteps {
  feats: StepQuery<FeatsData>;
  powers: StepQuery<PowersData>;
  skills: StepQuery<SkillsData>;
}

/** A step's query, as its answer is read: its data, its first load, and whether the data is for earlier picks. */
type StepQuery<T> = Pick<UseQueryResult<T>, "data" | "isLoading" | "isPlaceholderData">;

/** A feat pool of the level's slots. */
export type AptitudePool = FeatsData["aptitudePools"][string];

/** Whether a level takes an ability increase, and the character's abilities at it. */
export type AttributesData = StepAnswer<"abilities">;

export type FeatsData = StepAnswer<"feats">;

/** The character's abilities at a level, by name: each with its score and modifier. */
export type LevelAbilities = AttributesData["attributes"];

/** A spell pool of the level's slots. */
export type PowerAptitudePool = PowersData["aptitudePools"][string];

export type PowersData = StepAnswer<"powers">;

/** A planned level, as the Add Level preview lists it. */
export type PreviewLevelDetail = LevelPreview["levelDetails"][number];

export type SkillsData = StepAnswer<"skills">;

/**
 * Add Level's answers, its preview's of the plan: the planned levels and those that take an ability increase, where
 * each pool's next pick lands, the feat pools' room, what the skill points come to, and what of the feats and spells
 * picked fits, while the preview answers for these picks (for earlier ones, they stand).
 */
export function previewAnswers(preview: LevelPreview | undefined, isPlaceholderData: boolean): PreviewAnswers {
  const fittedFor = isPlaceholderData ? undefined : preview;
  return {
    abilityIncreaseLevels: preview?.attributes.abilityIncreaseLevels ?? [],
    featPools: preview?.feats.aptitudePools ?? {},
    fittedFeats: fittedFor?.feats.fitted,
    fittedPowers: fittedFor?.powers.fitted,
    levelDetails: preview?.levelDetails,
    nextPickLevels: preview?.nextPickLevels,
    skills: preview?.skills.skills,
  };
}

/**
 * Edit Level's answers, its steps' at the edited level: the feat pools' room, what the skill points come to, what of
 * the feats and spells picked fits, while each step answers for these picks (for earlier ones, they stand), and what
 * Next and the save wait for: its feat and spell steps' slots both, the Skills step its skill slots, and the step
 * shown its answer, whose failure stops the wizard there.
 */
export function stepAnswers({ feats, powers, skills }: EditedSteps, stepName: string): EditAnswers {
  return {
    complete: !!feats.data && !!powers.data && !!skills.data,
    featPools: feats.data?.aptitudePools ?? {},
    fittedFeats: feats.isPlaceholderData ? undefined : feats.data?.fitted,
    fittedPowers: powers.isPlaceholderData ? undefined : powers.data?.fitted,
    skills: skills.data?.skills,
    waiting:
      feats.isLoading ||
      powers.isLoading ||
      (stepName === "skills" && !skills.data) ||
      (stepName === "feats" && !feats.data) ||
      (stepName === "powers" && !powers.data),
  };
}
