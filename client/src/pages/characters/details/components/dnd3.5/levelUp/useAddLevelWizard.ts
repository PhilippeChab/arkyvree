import { useMemo } from "react";

import {
  type LevelPreview,
  useAddLevelPlan,
  useAddLevelWizardBase,
} from "@/client/src/pages/characters/details/components/levelUp/index.ts";

import { previewAnswers } from "./levelAnswers.ts";
import { usePickOptions } from "./usePickOptions.ts";

interface UseAddLevelWizardParams {
  characterId: string;
  /** The class it opens with planned for the next level, once the class options list it */
  klassId?: string;
  onClose: () => void;
  open: boolean;
}

/** The Add Level wizard's state: what its dialog and its steps read. */
export type AddLevelWizard = ReturnType<typeof useAddLevelWizard>;

/**
 * The character's abilities with the plan's increases, and whether they're picked, at levels that take one (`taken`):
 * none to pick otherwise.
 */
function abilityChoices({ attributes, picked }: LevelPreview["attributes"], taken: boolean) {
  return taken
    ? { isAvailable: true as const, attributes, picked }
    : { isAvailable: false as const, attributes: [], picked };
}

/**
 * 3.5's Add Level, on the generic wizard: its plan, what 3.5's preview answers of it (`previewAnswers`), and what its
 * steps read of the preview, its feat and spell options among them.
 */
export function useAddLevelWizard({ open, onClose, characterId, klassId }: UseAddLevelWizardParams) {
  const plan = useAddLevelPlan({ open, characterId, klassId });
  const { data: preview, isPlaceholderData, isLoading, error } = plan.previewQuery;
  const { stepName } = plan;
  const answers = useMemo(
    () => previewAnswers(preview, isPlaceholderData, stepName),
    [preview, isPlaceholderData, stepName],
  );
  const wizard = useAddLevelWizardBase({ plan, answers, characterId, open, onClose });
  const pickOptions = usePickOptions({ characterId, open, wizard });

  // The character's abilities with the plan's increases, at the levels that take one, and whether they're picked
  const abilityData = preview && abilityChoices(preview.attributes, answers.abilityIncreaseLevels.length > 0);

  // Each step reads the preview, which loads its answers together
  return {
    ...wizard,
    ...pickOptions,
    abilityIncreaseLevels: answers.abilityIncreaseLevels,
    abilityData,
    abilitiesError: error,
    featData: preview?.feats ?? null,
    featsError: error,
    isLoadingAbilities: isLoading,
    isLoadingFeats: isLoading,
    isLoadingPowers: isLoading,
    isLoadingSkills: isLoading,
    levelDetails: preview?.levelDetails ?? [],
    powerData: preview?.powers ?? null,
    powersError: error,
    // The skill points to spend over the planned levels, and each skill's spending, with the plan's increases
    skillData: preview?.skills ?? null,
    skillsError: error,
  };
}
