import { Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { LoadError } from "@/client/src/components/common/index.ts";
import { useFormSync } from "@/client/src/hooks/index.ts";
import type { EditingLevel } from "@/client/src/types/character.ts";

import {
  type BaseRules,
  characterLevelQuery,
  EDIT_STEP_CONTENT,
  EDIT_STEP_LABELS,
  type LevelUpFormData,
  useLevelWizard,
} from "./levelUp/index.ts";
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

  const wizard = useLevelWizard({ open, onClose, characterId, baseRules, editingLevelId });

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

  // The saved level fills the picks in as it loads, and its class's feat and power slots, which load after it, fit them:
  // Next waits for both, and a load that failed stops the wizard at the step that shows its error.
  const loading =
    isLoadingLevel || (!!editLevelData && !wizard.selectedClass) || wizard.isLoadingFeats || wizard.isLoadingPowers;
  const step = EDIT_STEP_CONTENT[wizard.activeStep];
  const failed = !editLevelData || (step === "feats" && !wizard.featData) || (step === "powers" && !wizard.powerData);

  const Sections = wizard.levelUpSections;

  const renderStepContent = () => {
    if (!editLevelData && levelError) return <LoadError what="Level" error={levelError} />;

    switch (step) {
      case "hp":
        return <Sections.LevelUpHpStep wizard={wizard} />;
      case "attributes":
        return <Sections.LevelUpAttributeStep wizard={wizard} baseRules={baseRules} />;
      case "skills":
        return <Sections.LevelUpSkillsStep wizard={wizard} />;
      case "feats":
        return <Sections.LevelUpFeatsStep wizard={wizard} characterId={characterId} />;
      case "powers":
        return <Sections.LevelUpPowersStep wizard={wizard} />;
      case "review":
        return <Sections.LevelUpReviewStep wizard={wizard} />;
      default:
        return <Typography>Unknown step</Typography>;
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
