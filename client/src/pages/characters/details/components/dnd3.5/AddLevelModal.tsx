import { AnimatedAlert, DiceSpinner, Modal } from "@/client/src/components/common/index.ts";
import { useDebouncedValue, useIsMobile } from "@/client/src/hooks/index.ts";
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
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BaseRules, SelectedKlass } from "./levelUp/useLevelWizard.ts";
import {
  useAddLevelWizard,
  addStepContent,
  addStepLabels,
} from "./levelUp/useAddLevelWizard.ts";


// ── Entry point ──────────────────────────────────────────────────────

interface AddLevelModalProps {
  open: boolean;
  onClose: () => void;
  characterId: string;
  baseRules: BaseRules;
}

export function AddLevelModal({
  open,
  onClose,
  characterId,
  baseRules,
}: AddLevelModalProps) {
  const isMobile = useIsMobile();

  const wizard = useAddLevelWizard({
    open,
    onClose,
    characterId,
    baseRules,
  });

  // ── Class selection ────────────────────────────────────────────────

  const [klassSearch, setKlassSearch] = useState("");
  const debouncedKlassSearch = useDebouncedValue(klassSearch);

  const allAbilityIds = useMemo(() => {
    if (wizard.classPlan.length === 0) return undefined;
    const ids = wizard.classPlan.map((_, i) => wizard.abilityIncreases[i] ?? "null");
    return ids.join(",");
  }, [wizard.classPlan, wizard.abilityIncreases]);

  const allPendingFeatPicks = useMemo(() => {
    const pairs = Object.entries(wizard.selectedFeats).flatMap(([aptitudeId, feats]) =>
      feats.map((f) => `${f.id}:${aptitudeId}`),
    );
    return pairs.length > 0 ? pairs.join(",") : undefined;
  }, [wizard.selectedFeats]);

  const pendingSkillAllocations = useMemo(() => {
    const entries = Object.entries(wizard.skillPointAllocations)
      .filter(([, rank]) => rank > 0)
      .map(([skillId, rank]) => `${skillId}:${rank}`);
    return entries.length > 0 ? entries.join(",") : undefined;
  }, [wizard.skillPointAllocations]);

  const {
    data: availableKlassesData,
    isLoading: isLoadingKlasses,
    fetchNextPage: fetchNextKlassPage,
    hasNextPage: hasNextKlassPage,
    isFetchingNextPage: isFetchingNextKlassPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.characters.levelUp.availableClasses(characterId, debouncedKlassSearch, wizard.allKlassLevelIds, allAbilityIds, allPendingFeatPicks, pendingSkillAllocations),
    queryFn: async ({ pageParam }) => {
      const response = await rpc.api.characters.levels[":characterId"][
        "available-classes"
      ]["$get"]({
        param: { characterId },
        query: {
          limit: "10",
          page: pageParam.toString(),
          ...(debouncedKlassSearch && { search: debouncedKlassSearch }),
          ...(wizard.allKlassLevelIds && { pendingLevelKlassLevelIds: wizard.allKlassLevelIds }),
          ...(allAbilityIds && { pendingLevelAbilityIds: allAbilityIds }),
          ...(allPendingFeatPicks && { pendingFeatPicks: allPendingFeatPicks }),
          ...(pendingSkillAllocations && { pendingSkillAllocations }),
        },
      });
      if (!response.ok) throw response;
      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: open && wizard.activeStep === 0,
    // Clicking "Add Level" appends a null slot to classPlan which flips
    // allAbilityIds ("null" → "null,null"), re-keys the query and would
    // normally drop data to undefined while refetching. Keep the previous
    // result visible during the refetch so the quick-add buttons don't flash.
    placeholderData: keepPreviousData,
  });

  const availableKlasses = useMemo(
    () => availableKlassesData?.pages.flatMap((page) => page.items) ?? [],
    [availableKlassesData?.pages],
  );

  // Quick-add buttons show the character's existing classes — they must not
  // follow the search (otherwise searching "bard" drops the "+ Fighter" etc.
  // buttons). Snapshot the unfiltered response and fall back to the snapshot
  // whenever search is active OR the current response is empty (e.g. mid-
  // refetch during any query-key churn that slipped past keepPreviousData).
  const quickAddKlassesRef = useRef<typeof availableKlasses>([]);
  if (!debouncedKlassSearch && availableKlasses.length > 0) {
    quickAddKlassesRef.current = availableKlasses;
  }
  const quickAddKlasses = !debouncedKlassSearch && availableKlasses.length > 0
    ? availableKlasses
    : quickAddKlassesRef.current;

  const handleKlassListScroll = useCallback(
    (event: React.UIEvent<HTMLElement>) => {
      const target = event.target as HTMLElement;
      const bottom =
        target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
      if (bottom && hasNextKlassPage && !isFetchingNextKlassPage) {
        fetchNextKlassPage();
      }
    },
    [hasNextKlassPage, isFetchingNextKlassPage, fetchNextKlassPage],
  );

  // ── Deferred step (minimum 300ms spinner before heavy render) ───────

  const [renderedStep, setRenderedStep] = useState(wizard.activeStep);

  useEffect(() => {
    if (renderedStep !== wizard.activeStep) {
      const id = setTimeout(() => setRenderedStep(wizard.activeStep), 300);
      return () => clearTimeout(id);
    }
  }, [wizard.activeStep, renderedStep]);

  // ── Render steps ───────────────────────────────────────────────────

  const Sections = wizard.levelUpSections;

  const stepTransitioning = renderedStep !== wizard.activeStep;

  const renderStepContent = (step: number) => {
    if (stepTransitioning) return <DiceSpinner />;
    const contentType = addStepContent[step];

    switch (contentType) {
      case "class-plan":
        return (
          <Sections.AddClassPlanStep
            levels={wizard.classPlan}
            slotKeys={wizard.slotKeys}
            availableKlasses={availableKlasses}
            quickAddKlasses={quickAddKlasses}
            isLoadingKlasses={isLoadingKlasses}
            onClassChange={wizard.handleClassChange}
            onAddLevel={wizard.handleAddLevel}
            onQuickAddLevel={wizard.handleQuickAddLevel}
            onRemoveLevel={wizard.handleRemoveLevel}
            handleKlassListScroll={handleKlassListScroll}
            setKlassSearch={setKlassSearch}
          />
        );
      case "hp":
        return (
          <Sections.AddHpStep
            levels={wizard.hpLevels}
            hpValues={wizard.hpValues}
            onHpChange={wizard.handleHpChange}
            onRoll={wizard.handleHpRoll}
            onRollAll={wizard.handleHpRollAll}
            onMaxAll={wizard.handleHpMaxAll}
          />
        );
      case "attributes":
        return (
          <Sections.AddAttributeStep
            attributeData={wizard.attributeData}
            isLoadingAttributes={wizard.isLoadingAttributes}
            attributesError={wizard.attributesError}
            abilityIncreaseLevels={wizard.abilityIncreaseLevels}
            abilityIncreases={wizard.abilityIncreases}
            onAbilityIncreaseChange={(index, abilityId) =>
              wizard.setAbilityIncreases((prev) => ({ ...prev, [index]: abilityId }))
            }
            levelDetails={wizard.levelDetails}
            baseRules={baseRules}
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
            perLevelClassSkillIds={wizard.perLevelClassSkillIds}
            perLevelSkillPoints={wizard.perLevelSkillPoints}
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
            klassId={wizard.classPlan.find((k): k is SelectedKlass => k !== null)?.id ?? ""}
            klassLevel={wizard.classPlan.filter((k): k is SelectedKlass => k !== null).at(-1)?.nextLevel ?? 1}
            allSelectedFeatPickString={wizard.allSelectedFeatPickString}
            pendingLevelKlassLevelIds={wizard.allKlassLevelIds}
            pendingLevelFeatPicks={wizard.allSelectedFeatPickString}
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
          <Sections.AddReviewStep
            classPlan={wizard.classPlan}
            hpValues={wizard.hpValues}
            abilityIncreases={wizard.abilityIncreases}
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
      <DialogTitle>Add Level</DialogTitle>
      <DialogContent
        sx={{
          height: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Cancel confirm */}
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

        {/* Validation errors */}
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
          sx={{
            mb: 2,
            "& .MuiAlert-action": { alignItems: "flex-start", pt: 0.5 },
          }}
        >
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            Validation warnings
          </Typography>
          <Box
            component="ul"
            sx={{ m: 0, pl: 2, maxWidth: "100%", overflow: "hidden" }}
          >
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

        {/* Stepper */}
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
          {addStepLabels.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {/* Step content */}
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
          disabled={wizard.isNextDisabled || wizard.finalizeMutation.isPending}
        >
          <DiceSpinner size="small" loading={wizard.finalizeMutation.isPending}>{wizard.nextButtonLabel}</DiceSpinner>
        </Button>
      </DialogActions>
    </Modal>
  );
}
