import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useController } from "react-hook-form";

import type { EditingLevel } from "@/client/src/components/characters/index.ts";
import { useFormSync } from "@/client/src/hooks/index.ts";

import type { HpLevel } from "./hitPoints.ts";
import { characterLevelQuery, type StepLevel } from "./levelUpQueries.ts";
import { pickPairString } from "./pendingPicks.ts";
import { type LevelUpFormData, useLevelWizardBase } from "./useLevelWizardBase.ts";
import { HP_STEP } from "./wizardSteps.ts";

interface EditedLevelParams {
  characterId: string;
  /** The level it edits, as the sheet lists it: its class, which the saved picks take. */
  editingLevel: EditingLevel;
  open: boolean;
}

/** Edit Level's state before the ruleset answers it: the level it edits, and the level its steps are asked at. */
export type EditedLevel = ReturnType<typeof useEditedLevel>;

/** Edit Level's own step before those the ruleset lists for the level: its hit points. */
const OWN_STEPS = [HP_STEP] as const;

/**
 * Edit Level's level, every ruleset's alike, on `useLevelWizardBase`: the saved level, its picks in the form once it
 * loads, its hit points, and the level the ruleset's steps are asked at (`step`; with its ability increase,
 * `increasedStep`; and with the feats and powers picked at it, `pickedStep`), which they answer (`EditAnswers`, read by
 * its hook for `useEditLevelWizardBase`).
 */
export function useEditedLevel({ open, characterId, editingLevel }: EditedLevelParams) {
  const editingLevelId = editingLevel.characterLevelId;
  const base = useLevelWizardBase({ characterId, editedLevelId: editingLevelId, open, ownSteps: OWN_STEPS });
  const { form, control, watch, picked } = base;

  const {
    data: levelData,
    isLoading: isLoadingLevel,
    error: levelError,
  } = useQuery({ ...characterLevelQuery(characterId, editingLevelId), enabled: open });

  // The saved level, as the wizard's picks: the form takes them once it loads
  const savedPicks = useMemo<LevelUpFormData | undefined>(
    () =>
      levelData && {
        selectedClass: {
          id: editingLevel.klassId,
          name: editingLevel.klassName,
          nextLevel: editingLevel.level,
          maxLevel: editingLevel.level,
          hd: editingLevel.hd,
          eligible: true,
        },
        selectedHP: levelData.hp,
        selectedAttribute: levelData.abilityIncreases[0]?.abilityId ?? null,
        selectedFeats: levelData.feats,
        selectedPowers: levelData.powers,
        skillPointAllocations: levelData.skills,
      },
    [levelData, editingLevel],
  );
  const sync = useFormSync(form, savedPicks, { key: editingLevelId });

  const selectedClass = watch("selectedClass");
  const selectedHP = watch("selectedHP");
  const selectedAttribute = watch("selectedAttribute");

  // The HP step's one level, the edited one, its HP the form's field
  const { field: hpField } = useController({ control, name: "selectedHP" });
  const hpLevels: HpLevel[] =
    selectedClass && levelData
      ? [
          {
            className: selectedClass.name,
            hd: selectedClass.hd,
            hitPoints: levelData.hitPoints,
            nextLevel: selectedClass.nextLevel,
          },
        ]
      : [];

  // The edited level's class and level, which the slot and picker endpoints take.
  const step: StepLevel = {
    classId: selectedClass?.id,
    level: selectedClass?.nextLevel,
    editedLevelId: editingLevelId,
  };
  // The edited level with its ability increase, which its skill points, its slots and its pickers' options read
  const increasedStep: StepLevel = { ...step, abilityId: selectedAttribute ?? undefined };
  // The level with its feats and spells, which the steps that fit them to their pools take
  const pickedStep: StepLevel = {
    ...increasedStep,
    picks: { feats: pickPairString(picked.feats), powers: pickPairString(picked.powers) },
  };

  return {
    ...base,
    editingLevelId,
    handleHpChange: (_index: number, hp: number | null) => hpField.onChange(hp),
    hpInputRef: hpField.ref,
    hpLevels,
    hpValues: [selectedHP],
    increasedStep,
    isLoadingLevel,
    levelData,
    levelError,
    pickedStep,
    selectedAttribute,
    selectedClass,
    selectedHP,
    step,
    sync,
  };
}
