import { AnimatedAlert, Modal } from "@/client/src/components/common/index.ts";
import { useIsMobile } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import {
  Box,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from "@mui/material";
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
  const isMobile = useIsMobile();
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
      const response = await rpc.api.characters.levels[":characterId"][
        ":characterLevelId"
      ]["$get"]({
        param: { characterId, characterLevelId: editingLevelId },
      });
      if (!response.ok) throw response;
      return response.json();
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
    <Modal
      open={open}
      onClose={(_, reason) => {
        if (reason !== "backdropClick") wizard.handleCancel();
      }}
      maxWidth="md"
      sx={{
        ...(!isMobile && {
          "& .MuiDialog-paper": {
            height: "90vh",
            maxHeight: "90vh",
          },
        }),
      }}
    >
      <DialogTitle>Edit Level</DialogTitle>
      <DialogContent
        sx={{
          height: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <AnimatedAlert
          in={wizard.showCancelConfirm}
          severity="warning"
          action={
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                onClick={() => wizard.setShowCancelConfirm(false)}
              >
                Keep editing
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="error"
                onClick={wizard.handleConfirmCancel}
              >
                Discard
              </Button>
            </Stack>
          }
          sx={{ mb: 2 }}
        >
          Discard all level-up progress?
        </AnimatedAlert>
        <AnimatedAlert
          in={wizard.validationErrors.length > 0}
          severity="warning"
          onClose={() => wizard.setValidationErrors([])}
          action={
            <Button
              size="small"
              variant="outlined"
              color="warning"
              onClick={wizard.handleForceSubmit}
              disabled={wizard.finalizeMutation.isPending}
              sx={{ whiteSpace: "nowrap" }}
            >
              Proceed Anyway
            </Button>
          }
          sx={{ mb: 2, "& .MuiAlert-action": { alignItems: "flex-start", pt: 0.5 } }}
        >
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            Validation warnings
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2, maxWidth: "100%", overflow: "hidden" }}>
            {wizard.validationErrors.map((issue, i) => (
              <li key={i}>
                {issue.entityName && (
                  <Typography
                    component="span"
                    variant="body2"
                    sx={{ fontWeight: "bold" }}
                  >
                    {issue.entityName}
                    {issue.entityType ? ` (${issue.entityType})` : ""}
                    {": "}
                  </Typography>
                )}
                <Typography component="span" variant="body2">
                  {issue.message}
                </Typography>
                {issue.requirementTree && (
                  <Typography
                    component="pre"
                    variant="caption"
                    sx={{
                      mt: 0.5,
                      whiteSpace: "pre-wrap",
                      fontFamily: "monospace",
                      bgcolor: "action.hover",
                      p: 0.5,
                      borderRadius: 0.5,
                      maxWidth: "100%",
                      overflow: "auto",
                    }}
                  >
                    {issue.requirementTree}
                  </Typography>
                )}
              </li>
            ))}
          </Box>
        </AnimatedAlert>
        <Stepper
          activeStep={wizard.activeStep}
          alternativeLabel={isMobile}
          sx={{
            mb: 3,
            flexShrink: 0,
            "& .MuiStepLabel-iconContainer": {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            },
            "& svg text": {
              dominantBaseline: "middle",
              textAnchor: "middle",
            },
            ...(isMobile && {
              "& .MuiStepLabel-label": {
                fontSize: "0.65rem",
              },
            }),
          }}
        >
          {editStepLabels.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
        <Box
          sx={{
            flex: 1,
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          {renderStepContent(wizard.activeStep)}
        </Box>
      </DialogContent>
      <DialogActions sx={{ flexShrink: 0 }}>
        <Button onClick={wizard.handleCancel} variant="outlined" color="inherit">Cancel</Button>
        <Box sx={{ flex: "1 1 auto" }} />
        {wizard.activeStep !== 0 && (
          <Button onClick={wizard.handleBack}>Back</Button>
        )}
        <Button
          onClick={wizard.handleNext}
          disabled={wizard.isNextDisabled}
        >
          {wizard.activeStep === editStepLabels.length - 1
            ? "Finish"
            : "Next"}
        </Button>
      </DialogActions>
    </Modal>
  );
}
