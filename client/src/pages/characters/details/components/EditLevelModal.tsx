import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { EditingLevel } from "@/client/src/components/characters/index.ts";
import { LoadError } from "@/client/src/components/common/index.ts";
import { useFormSync } from "@/client/src/hooks/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

import {
  characterLevelQuery,
  EDIT_STEP_CONTENT,
  EDIT_STEP_LABELS,
  type LevelUpFormData,
  useEditLevelWizard,
} from "./dnd3.5/levelUp/index.ts";
import { getLevelUpSections } from "./levelUpFactory.ts";
import { LevelWizardDialog } from "./LevelWizardDialog.tsx";

interface EditLevelModalProps {
  baseRules: BaseRules;
  characterId: string;
  editingLevel: EditingLevel;
  onClose: () => void;
  /** It has faded out: its owner unmounts it. */
  onExited: () => void;
  open: boolean;
}

export function EditLevelModal({ open, onClose, onExited, characterId, baseRules, editingLevel }: EditLevelModalProps) {
  const editingLevelId = editingLevel.characterLevelId;

  const wizard = useEditLevelWizard({ open, onClose, characterId, editingLevelId });

  // Edit-only: fetch existing level data
  const {
    data: editLevelData,
    isLoading: isLoadingLevel,
    error: levelError,
  } = useQuery({ ...characterLevelQuery(characterId, editingLevelId), enabled: open });

  // The saved level, as the wizard's picks: the form takes them once it loads
  const savedPicks = useMemo<LevelUpFormData | undefined>(
    () =>
      editLevelData && {
        selectedClass: {
          id: editingLevel.klassId,
          name: editingLevel.klassName,
          nextLevel: editingLevel.level,
          maxLevel: editingLevel.level,
          hd: editingLevel.hd,
          eligible: true,
        },
        selectedHP: editLevelData.hp,
        selectedAttribute: editLevelData.abilityId,
        selectedFeats: editLevelData.feats,
        selectedPowers: editLevelData.powers,
        skillPointAllocations: editLevelData.skills,
      },
    [editLevelData, editingLevel],
  );
  useFormSync(wizard.form, savedPicks, { key: editingLevelId });

  // The saved level fills the picks in as it loads, and its class's slots, which load after it, fit its picks: Next
  // waits for its feat and power slots both, the Skills step for its skill slots, and a load that failed stops the
  // wizard at the step that shows its error.
  const loading =
    isLoadingLevel || (!!editLevelData && !wizard.selectedClass) || wizard.isLoadingFeats || wizard.isLoadingPowers;
  const step = EDIT_STEP_CONTENT[wizard.activeStep];
  const failed =
    !editLevelData ||
    (step === "skills" && !wizard.skillData) ||
    (step === "feats" && !wizard.featData) ||
    (step === "powers" && !wizard.powerData);

  const Sections = getLevelUpSections(baseRules);

  const renderStepContent = () => {
    if (!editLevelData && levelError) return <LoadError what="Level" error={levelError} />;

    switch (step) {
      case "hp":
        return <Sections.HpStep wizard={wizard} />;
      case "attributes":
        return <Sections.EditAttributeStep wizard={wizard} baseRules={baseRules} />;
      case "skills":
        return <Sections.SkillsStep wizard={wizard} />;
      case "feats":
        return <Sections.FeatsStep wizard={wizard} characterId={characterId} />;
      case "powers":
        return <Sections.PowersStep wizard={wizard} />;
      case "review":
        return <Sections.EditReviewStep wizard={wizard} />;
    }
  };

  return (
    <LevelWizardDialog
      open={open}
      onExited={onExited}
      title="Edit Level"
      wizard={{ ...wizard, isNextDisabled: wizard.isNextDisabled || loading || failed }}
      stepLabels={EDIT_STEP_LABELS}
      finishLabel="Finish"
      isSaving={wizard.finalizeMutation.isPending}
    >
      {renderStepContent()}
    </LevelWizardDialog>
  );
}
