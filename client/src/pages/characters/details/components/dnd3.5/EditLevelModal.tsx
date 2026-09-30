import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { Alert } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import type { EditingLevel } from "@/client/src/types/character.ts";
import { type BaseRules, editStepContent, editStepLabels, useLevelWizard } from "./levelUp/index.ts";
import { LevelWizardDialog } from "./LevelWizardDialog.tsx";

interface EditLevelModalProps {
  open: boolean;
  onClose: () => void;
  characterId: string;
  baseRules: BaseRules;
  editingLevel: EditingLevel;
}

export function EditLevelModal({
  open,
  onClose,
  characterId,
  baseRules,
  editingLevel,
}: EditLevelModalProps) {
  const editingLevelId = editingLevel.characterLevelId;

  // Pre-population refs
  const editDataAppliedRef = useRef(false);
  const editFeatsAppliedRef = useRef(false);
  const editPowersAppliedRef = useRef(false);

  const resetEditRefs = useCallback(() => {
    editDataAppliedRef.current = false;
    editFeatsAppliedRef.current = false;
    editPowersAppliedRef.current = false;
  }, []);

  const wizard = useLevelWizard({
    open,
    onClose,
    characterId,
    baseRules,
    editingLevelId,
    onReset: resetEditRefs,
  });

  // ── Edit-only: fetch existing level data ────────────────────────────

  const { data: editLevelData, isLoading: isLoadingLevel, error: levelError } = useQuery({
    queryKey: queryKeys.characters.levelUp.levelData(
      characterId,
      editingLevelId,
    ),
    queryFn: async () => {
      return parseResponse(rpc.api.characters.levels[":characterId"][
        ":characterLevelId"
      ]["$get"]({
        param: { characterId, characterLevelId: editingLevelId },
      }));
    },
    enabled: open && !!editingLevelId,
  });

  // ── Pre-populate form ───────────────────────────────────────────────

  const { setValue: wizardSetValue } = wizard;

  // Set selectedClass + basic fields from edit data
  useEffect(() => {
    if (!editLevelData || !editingLevel || editDataAppliedRef.current) return;
    editDataAppliedRef.current = true;

    wizardSetValue("selectedClass", {
      id: editingLevel.klassId,
      name: editingLevel.klassName,
      nextLevel: editingLevel.level,
      maxLevel: editingLevel.level,
      hd: editingLevel.hd,
      eligible: true,
    });

    wizardSetValue("selectedHP", editLevelData.hp);
    wizardSetValue("selectedAttribute", editLevelData.abilityId);
    wizardSetValue("skillPointAllocations", editLevelData.skills);
  }, [editLevelData, editingLevel, wizardSetValue]);

  // Pre-populate feats from edit data
  useEffect(() => {
    if (!editLevelData || !wizard.featData || editFeatsAppliedRef.current)
      return;
    editFeatsAppliedRef.current = true;
    // A saved level's feats have the selected-feat shape.
    if (Object.keys(editLevelData.feats).length > 0) wizardSetValue("selectedFeats", editLevelData.feats);
  }, [editLevelData, wizard.featData, wizardSetValue]);

  // Pre-populate powers from edit data
  useEffect(() => {
    if (!editLevelData || !wizard.powerData || editPowersAppliedRef.current)
      return;
    editPowersAppliedRef.current = true;
    if (Object.keys(editLevelData.powers).length > 0) wizardSetValue("selectedPowers", editLevelData.powers);
  }, [editLevelData, wizard.powerData, wizardSetValue]);

  // Reset refs when dialog opens
  useEffect(() => {
    if (open) {
      resetEditRefs();
    }
  }, [open, editingLevelId, resetEditRefs]);

  // The saved level fills the picks in as it loads (the level, then its class's feat and power slots): Next waits while
  // it loads, or a quick Finish would save the level without its feats and powers. Saving without them would erase
  // them, so a load that failed stops the wizard at the step that shows its error.
  const loading = isLoadingLevel || (!!editLevelData && !wizard.selectedClass) || wizard.isLoadingFeats || wizard.isLoadingPowers;
  const step = editStepContent[wizard.activeStep];
  const failed = !editLevelData || (step === "feats" && !wizard.featData) || (step === "powers" && !wizard.powerData);

  // ── Render steps ────────────────────────────────────────────────────

  const Sections = wizard.levelUpSections;

  const renderStepContent = (step: number) => {
    if (levelError) return <Alert severity="error">{loadFailureMessage("Level", levelError)}</Alert>;
    const contentType = editStepContent[step];

    switch (contentType) {
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
      {renderStepContent(wizard.activeStep)}
    </LevelWizardDialog>
  );
}
