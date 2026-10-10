import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { EditingLevel } from "@/client/src/components/characters/index.ts";
import {
  levelStepQuery,
  skillPointString,
  useEditedLevel,
  useEditLevelWizardBase,
} from "@/client/src/pages/characters/details/components/levelUp/index.ts";

import { stepAnswers } from "./levelAnswers.ts";
import { usePickOptions } from "./usePickOptions.ts";

interface UseEditLevelWizardParams {
  characterId: string;
  /** The level it edits, as the sheet lists it: its class, which the saved picks take. */
  editingLevel: EditingLevel;
  onClose: () => void;
  open: boolean;
}

/** The Edit Level wizard's state: what its dialog and its steps read. */
export type EditLevelWizard = ReturnType<typeof useEditLevelWizard>;

/**
 * 3.5's Edit Level, on the generic wizard: the level it edits, 3.5's steps asked at it by name, what they answer of its
 * picks (`stepAnswers`), and what its steps read of them, its feat and spell options among them.
 */
export function useEditLevelWizard({ open, onClose, characterId, editingLevel }: UseEditLevelWizardParams) {
  const level = useEditedLevel({ open, characterId, editingLevel });
  const { debouncedSkillPoints, increasedStep, pickedStep, stepName } = level;

  // The level's abilities, and whether the increase picked is the one it takes, which Next waits for: its last answer
  // kept while it answers for a new pick
  const attributesQuery = useQuery({
    ...levelStepQuery(characterId, "abilities", increasedStep),
    enabled: open && stepName === "abilities",
    placeholderData: keepPreviousData,
  });

  // The skill points spent so far, which the skills step says what they come to, its last answer kept meanwhile
  const skillsQuery = useQuery({
    ...levelStepQuery(characterId, "skills", { ...increasedStep, skillPoints: skillPointString(debouncedSkillPoints) }),
    enabled: open && stepName === "skills",
    placeholderData: keepPreviousData,
  });

  // The level with its feats and spells, which its feat and spell steps fit to their pools: each step's last answer kept
  // while it answers for the new picks, which stand meanwhile
  const featsQuery = useQuery({
    ...levelStepQuery(characterId, "feats", pickedStep),
    enabled: open,
    placeholderData: keepPreviousData,
  });
  const powersQuery = useQuery({
    ...levelStepQuery(characterId, "powers", pickedStep),
    enabled: open,
    placeholderData: keepPreviousData,
  });

  const answers = stepAnswers(
    { abilities: attributesQuery, feats: featsQuery, powers: powersQuery, skills: skillsQuery },
    stepName,
  );
  const wizard = useEditLevelWizardBase({ level, answers, characterId, onClose });
  const pickOptions = usePickOptions({ characterId, open, wizard });

  return {
    ...wizard,
    ...pickOptions,
    attributeData: attributesQuery.data,
    attributesError: attributesQuery.error,
    featData: featsQuery.data,
    featsError: featsQuery.error,
    isLoadingAttributes: attributesQuery.isLoading,
    isLoadingFeats: featsQuery.isLoading,
    isLoadingPowers: powersQuery.isLoading,
    isLoadingSkills: skillsQuery.isLoading,
    powerData: powersQuery.data,
    powersError: powersQuery.error,
    skillData: skillsQuery.data,
    skillsError: skillsQuery.error,
  };
}
