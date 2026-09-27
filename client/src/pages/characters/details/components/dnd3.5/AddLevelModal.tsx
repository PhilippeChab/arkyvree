import { DiceSpinner } from "@/client/src/components/common/index.ts";
import { useDebouncedValue } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { BaseRules, SelectedKlass } from "./levelUp/useLevelWizard.ts";
import { LevelWizardDialog } from "./LevelWizardDialog.tsx";
import {
  useAddLevelWizard,
  addStepContent,
  addStepLabels,
} from "./levelUp/useAddLevelWizard.ts";
import { createListboxScrollHandler } from "@/client/src/lib/listboxScroll.ts";


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
      return parseResponse(rpc.api.characters.levels[":characterId"][
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
      }));
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
  const [quickAddSnapshot, setQuickAddSnapshot] = useState<typeof availableKlasses>([]);
  const hasUnfilteredKlasses = !debouncedKlassSearch && availableKlasses.length > 0;
  if (hasUnfilteredKlasses && availableKlasses !== quickAddSnapshot) {
    setQuickAddSnapshot(availableKlasses);
  }
  const quickAddKlasses = hasUnfilteredKlasses ? availableKlasses : quickAddSnapshot;

  const handleKlassListScroll = createListboxScrollHandler({
    hasNextPage: hasNextKlassPage,
    isFetchingNextPage: isFetchingNextKlassPage,
    fetchNextPage: fetchNextKlassPage,
  });

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
            getValues={wizard.getValues}
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
    <LevelWizardDialog
      open={open}
      title="Add Level"
      wizard={wizard}
      stepLabels={addStepLabels}
      finishLabel="Finish All"
      isSaving={wizard.finalizeMutation.isPending}
    >
      {renderStepContent(wizard.activeStep)}
    </LevelWizardDialog>
  );
}
