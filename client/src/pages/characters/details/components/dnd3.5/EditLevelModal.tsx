import { useQuery } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useMemo } from "react";

import { LoadError } from "@/client/src/components/common/index.ts";
import { useFormSync } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import type { EditingLevel } from "@/client/src/types/character.ts";

import {
  type BaseRules,
  editStepContent,
  editStepLabels,
  type LevelUpFormData,
  useLevelWizard,
} from "./levelUp/index.ts";
import { LevelWizardDialog } from "./LevelWizardDialog.tsx";

interface EditLevelModalProps {
  open: boolean;
  onClose: () => void;
  characterId: string;
  baseRules: BaseRules;
  editingLevel: EditingLevel;
}

export function EditLevelModal({ open, onClose, characterId, baseRules, editingLevel }: EditLevelModalProps) {
  const editingLevelId = editingLevel.characterLevelId;

  const wizard = useLevelWizard({ open, onClose, characterId, baseRules, editingLevelId });

  // Edit-only: fetch existing level data
  const {
    data: editLevelData,
    isLoading: isLoadingLevel,
    error: levelError,
  } = useQuery({
    queryKey: queryKeys.characters.levelUp.levelData(characterId, editingLevelId),
    queryFn: async () => {
      return parseResponse(
        rpc.api.characters.levels[":characterId"][":characterLevelId"]["$get"]({
          param: { characterId, characterLevelId: editingLevelId },
        }),
      );
    },
    enabled: open && !!editingLevelId,
  });

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
  const step = editStepContent[wizard.activeStep];
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
        return (
          <Sections.LevelUpFeatsStep
            wizard={wizard}
            characterId={characterId}
            klassId={wizard.selectedClass?.id ?? ""}
            klassLevel={wizard.selectedClass?.nextLevel ?? 1}
            editingLevelId={editingLevelId}
          />
        );
      case "powers":
        return <Sections.LevelUpPowersStep wizard={wizard} />;
      case "review":
        return <Sections.LevelUpReviewStep wizard={wizard} />;
      default:
        return <p>Unknown step</p>;
    }
  };

  return (
    <LevelWizardDialog
      open={open}
      title="Edit Level"
      wizard={{ ...wizard, isNextDisabled: wizard.isNextDisabled || loading || failed }}
      stepLabels={editStepLabels}
      finishLabel="Finish"
      isSaving={wizard.finalizeMutation.isPending}
    >
      {renderStepContent()}
    </LevelWizardDialog>
  );
}
