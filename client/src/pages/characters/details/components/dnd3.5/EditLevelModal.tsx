import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import type { EditingLevel } from "@/client/src/types/character.ts";
import {
  type AptitudeModifier,
  type SelectedFeat,
  type BaseRules,
  editStepContent,
  editStepLabels,
  useLevelWizard,
} from "./levelUp/useLevelWizard.ts";
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
    stepContent: editStepContent,
    onReset: resetEditRefs,
  });

  // ── Edit-only: fetch existing level data ────────────────────────────

  const { data: editLevelData } = useQuery({
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
    const editFeats = editLevelData.feats;
    if (!editFeats || Object.keys(editFeats).length === 0) return;
    const prePopulated: Record<string, SelectedFeat[]> = {};
    for (const [aptitudeId, feats] of Object.entries(editFeats)) {
      prePopulated[aptitudeId] = (
        feats as Array<{
          id: string;
          name: string;
          description?: string;
          aptitudeModifiers?: AptitudeModifier[];
        }>
      ).map((f) => ({
        id: f.id,
        name: f.name,
        description: f.description,
        aptitudeModifiers: f.aptitudeModifiers,
      }));
    }
    wizardSetValue("selectedFeats", prePopulated);
  }, [editLevelData, wizard.featData, wizardSetValue]);

  // Pre-populate powers from edit data
  useEffect(() => {
    if (!editLevelData || !wizard.powerData || editPowersAppliedRef.current)
      return;
    editPowersAppliedRef.current = true;
    const editPowers = editLevelData.powers;
    if (!editPowers || Object.keys(editPowers).length === 0) return;
    const prePopulated: Record<
      string,
      Array<{ id: string; name: string; description?: string; powerLevel?: number }>
    > = {};
    for (const [aptitudeId, powers] of Object.entries(editPowers)) {
      prePopulated[aptitudeId] = (
        powers as Array<{ id: string; name: string; description?: string; powerLevel?: number }>
      ).map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        powerLevel: p.powerLevel,
      }));
    }
    wizardSetValue("selectedPowers", prePopulated);
  }, [editLevelData, wizard.powerData, wizardSetValue]);

  // Reset refs when dialog opens
  useEffect(() => {
    if (open) {
      resetEditRefs();
    }
  }, [open, editingLevelId, resetEditRefs]);

  // ── Render steps ────────────────────────────────────────────────────

  const Sections = wizard.levelUpSections;

  const renderStepContent = (step: number) => {
    const contentType = editStepContent[step];

    switch (contentType) {
      case "hp":
        return (
          <Sections.LevelUpHpStep
            selectedClass={wizard.selectedClass}
            selectedHP={wizard.selectedHP}
            isEditing={true}
            hpRolling={wizard.hpRolling}
            hpSettled={wizard.hpSettled}
            hpDisplayValue={wizard.hpDisplayValue}
            triggerHpRoll={wizard.triggerHpRoll}
            setValue={wizard.setValue}
          />
        );
      case "attributes":
        return (
          <Sections.LevelUpAttributeStep
            attributeData={wizard.attributeData}
            isLoadingAttributes={wizard.isLoadingAttributes}
            attributesError={wizard.attributesError}
            selectedAttribute={wizard.selectedAttribute}
            baseRules={baseRules}
            setValue={wizard.setValue}
          />
        );
      case "skills":
        return (
          <Sections.LevelUpSkillsStep
            skillData={wizard.skillData}
            isLoadingSkills={wizard.isLoadingSkills}
            skillsError={wizard.skillsError}
            skillPointAllocations={wizard.skillPointAllocations}
            setValue={wizard.setValue}
            getValues={wizard.getValues}
          />
        );
      case "feats":
        return (
          <Sections.LevelUpFeatsStep
            featData={wizard.featData}
            isLoadingFeats={wizard.isLoadingFeats}
            featsError={wizard.featsError}
            adjustedFeatPools={wizard.adjustedFeatPools}
            selectedFeats={wizard.selectedFeats}
            selectedAptitude={wizard.selectedAptitude}
            setSelectedAptitude={wizard.setSelectedAptitude}
            groupedFeats={wizard.groupedFeats}
            isLoadingAvailableFeats={wizard.isLoadingAvailableFeats}
            isFetchingNextFeatsPage={wizard.isFetchingNextFeatsPage}
            expandedFeatFamilies={wizard.expandedFeatFamilies}
            toggleFeatFamily={wizard.toggleFeatFamily}
            characterId={characterId}
            klassId={wizard.selectedClass?.id ?? ""}
            klassLevel={wizard.selectedClass?.nextLevel ?? 1}
            editingLevelId={editingLevelId}
            allSelectedFeatPickString={wizard.allSelectedFeatPickString}
            featSearch={wizard.featSearch}
            setFeatSearch={wizard.setFeatSearch}
            handleFeatsScroll={wizard.handleFeatsScroll}
            setValue={wizard.setValue}
            handleDeleteFeat={wizard.handleDeleteFeat}
          />
        );
      case "powers":
        return (
          <Sections.LevelUpPowersStep
            powerData={wizard.powerData}
            isLoadingPowers={wizard.isLoadingPowers}
            powersError={wizard.powersError}
            selectedPowers={wizard.selectedPowers}
            selectedFeats={wizard.selectedFeats}
            selectedPowerAptitude={wizard.selectedPowerAptitude}
            selectedPowerLevel={wizard.selectedPowerLevel}
            setSelectedPowerAptitude={wizard.setSelectedPowerAptitude}
            setSelectedPowerLevel={wizard.setSelectedPowerLevel}
            availablePowers={wizard.availablePowers}
            isLoadingAvailablePowers={wizard.isLoadingAvailablePowers}
            isFetchingNextPowersPage={wizard.isFetchingNextPowersPage}
            powerSearch={wizard.powerSearch}
            setValue={wizard.setValue}
            handleDeletePower={wizard.handleDeletePower}
            onPowerSearchChange={wizard.setPowerSearch}
            onPowersScroll={wizard.handlePowersScroll}
          />
        );
      case "review":
        return (
          <Sections.LevelUpReviewStep
            selectedClass={wizard.selectedClass}
            selectedHP={wizard.selectedHP}
            selectedAttribute={wizard.selectedAttribute}
            attributeData={wizard.attributeData}
            skillPointAllocations={wizard.skillPointAllocations}
            skillData={wizard.skillData}
            selectedFeats={wizard.selectedFeats}
            featData={wizard.featData}
            selectedPowers={wizard.selectedPowers}
            powerData={wizard.powerData}
          />
        );
      default:
        return <p>Unknown step</p>;
    }
  };

  return (
    <LevelWizardDialog
      open={open}
      title="Edit Level"
      wizard={wizard}
      stepLabels={editStepLabels}
      finishLabel="Finish"
      isSaving={wizard.finalizeMutation.isPending}
    >
      {renderStepContent(wizard.activeStep)}
    </LevelWizardDialog>
  );
}
