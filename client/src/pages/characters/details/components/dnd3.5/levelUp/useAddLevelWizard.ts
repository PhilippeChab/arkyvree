import { useMemo } from "react";

import {
  useAddLevelPlan,
  useAddLevelWizardBase,
} from "@/client/src/pages/characters/details/components/levelUp/index.ts";

import { previewAnswers } from "./levelAnswers.ts";
import { usePickOptions } from "./usePickOptions.ts";

interface UseAddLevelWizardParams {
  characterId: string;
  onClose: () => void;
  open: boolean;
}

/** The Add Level wizard's state: what its dialog and its steps read. */
export type AddLevelWizard = ReturnType<typeof useAddLevelWizard>;

/**
 * 3.5's Add Level, on the generic wizard: its plan, what 3.5's preview answers of it (`previewAnswers`), and what its
 * steps read of the preview, its feat and spell options among them.
 */
export function useAddLevelWizard({ open, onClose, characterId }: UseAddLevelWizardParams) {
  const plan = useAddLevelPlan({ open, characterId });
  const { data: preview, isPlaceholderData, isLoading, error } = plan.previewQuery;
  const answers = useMemo(() => previewAnswers(preview, isPlaceholderData), [preview, isPlaceholderData]);
  const wizard = useAddLevelWizardBase({ plan, answers, characterId, open, onClose });
  const pickOptions = usePickOptions({ characterId, open, wizard });

  // The character's abilities with the plan's increases, at the levels that take one
  const attributeData = useMemo(() => {
    if (!preview) return undefined;
    if (answers.abilityIncreaseLevels.length === 0) return { isAvailable: false as const, attributes: {} };
    return { isAvailable: true as const, attributes: preview.attributes.attributes };
  }, [preview, answers.abilityIncreaseLevels]);

  // Each step reads the preview, which loads its answers together
  return {
    ...wizard,
    ...pickOptions,
    abilityIncreaseLevels: answers.abilityIncreaseLevels,
    attributeData,
    attributesError: error,
    featData: preview?.feats ?? null,
    featsError: error,
    isLoadingAttributes: isLoading,
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
