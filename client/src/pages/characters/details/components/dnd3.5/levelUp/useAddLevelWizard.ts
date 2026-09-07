import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { useDebouncedValue } from "@/client/src/hooks/index.ts";
import { rollDie } from "@/client/src/lib/dice.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import {
  ApiError,
  type ApiValidationIssue,
  rpc,
} from "@/client/src/services/rpc.ts";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { getLevelUpSections } from "../levelUpFactory.ts";
import {
  computeMaxPointsForSkill,
} from "@/shared/dnd3.5/skills.ts";
import type {
  AptitudePool,
  BaseRules,
  LevelUpFormData,
  SelectedKlass,
} from "./useLevelWizard.ts";

// ── Step definitions ─────────────────────────────────────────────────

export const addStepContent = [
  "class-plan",
  "hp",
  "attributes",
  "skills",
  "feats",
  "powers",
  "review",
] as const;

export const addStepLabels = [
  "Class Plan",
  "Select HP",
  "Attribute Increase",
  "Select Skills",
  "Select Feats",
  "Select Spells",
  "Review Changes",
];

// ── Types ────────────────────────────────────────────────────────────

interface UseAddLevelWizardParams {
  open: boolean;
  onClose: () => void;
  characterId: string;
  baseRules: BaseRules;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useAddLevelWizard({
  open,
  onClose,
  characterId,
  baseRules,
}: UseAddLevelWizardParams) {
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const levelUpSections = getLevelUpSections(baseRules);

  // Step index mapping
  const featsStep = addStepContent.indexOf("feats");
  const powersStep = addStepContent.indexOf("powers");

  // ── Stepper ──────────────────────────────────────────────────────

  const [activeStep, setActiveStep] = useState(0);

  // ── Class plan state ─────────────────────────────────────────────

  const slotCounter = useRef(0);
  const [slotKeys, setSlotKeys] = useState<number[]>([]);
  const [classPlan, setClassPlan] = useState<(SelectedKlass | null)[]>([]);

  const handleClassChange = (index: number, klass: SelectedKlass | null) => {
    const next = [...classPlan];
    next[index] = klass;
    setClassPlan(next);
  };

  // Derive adjusted nextLevel values — each duplicate class increments from the server's base
  const adjustedClassPlan = useMemo(() => {
    const counters = new Map<string, number>();
    return classPlan.map((k) => {
      if (!k) return k;
      const count = counters.get(k.id) ?? 0;
      counters.set(k.id, count + 1);
      return { ...k, nextLevel: k.nextLevel + count };
    });
  }, [classPlan]);

  const handleAddLevel = useCallback(() => {
    const key = slotCounter.current++;
    setSlotKeys((prev) => [...prev, key]);
    setClassPlan((prev) => [...prev, null]);
  }, []);

  const handleQuickAddLevel = useCallback((klass: SelectedKlass) => {
    const key = slotCounter.current++;
    setSlotKeys((prev) => [...prev, key]);
    setClassPlan((prev) => [...prev, klass]);
  }, []);

  const handleRemoveLevel = useCallback((index: number) => {
    setClassPlan((prev) => {
      const wasNull = prev[index] === null;
      const validIndex = wasNull ? -1 : prev.slice(0, index).filter((k) => k !== null).length;

      if (!wasNull) {
        setHpValues((hp) => hp.filter((_, i) => i !== validIndex));
        setAbilityIncreases((ai) => {
          const next: Record<number, string | null> = {};
          for (const [k, v] of Object.entries(ai)) {
            const idx = Number(k);
            if (idx < validIndex) next[idx] = v;
            else if (idx > validIndex) next[idx - 1] = v;
          }
          return next;
        });
      }

      return prev.filter((_, i) => i !== index);
    });
    setSlotKeys((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── HP state ─────────────────────────────────────────────────────

  const [hpValues, setHpValues] = useState<(number | null)[]>([]);

  // Only non-null entries matter for downstream steps
  const validClassPlan = useMemo(
    () => classPlan.filter((k): k is SelectedKlass => k !== null),
    [classPlan],
  );

  // Sync hpValues length with valid (non-null) class plan entries
  useEffect(() => {
    setHpValues((prev) => {
      if (prev.length === validClassPlan.length) return prev;
      if (prev.length < validClassPlan.length) {
        return [
          ...prev,
          ...Array(validClassPlan.length - prev.length).fill(null),
        ];
      }
      return prev.slice(0, validClassPlan.length);
    });
  }, [validClassPlan.length]);

  const handleHpChange = useCallback(
    (index: number, value: number | null) => {
      setHpValues((prev) => {
        const next = [...prev];
        next[index] = value;
        return next;
      });
    },
    [],
  );

  const handleHpRoll = useCallback(
    (index: number) => {
      const klass = validClassPlan[index];
      if (!klass) return;
      const result = rollDie(klass.hd);
      setHpValues((prev) => {
        const next = [...prev];
        next[index] = result;
        return next;
      });
    },
    [validClassPlan],
  );

  const handleHpRollAll = useCallback(() => {
    setHpValues(
      validClassPlan.map((klass) => rollDie(klass.hd)),
    );
  }, [validClassPlan]);

  const handleHpMaxAll = useCallback(() => {
    setHpValues(
      validClassPlan.map((klass) => klass.hd),
    );
  }, [validClassPlan]);

  const hpLevels = useMemo(
    () =>
      adjustedClassPlan
        .filter((k): k is SelectedKlass => k !== null)
        .map((k) => ({ className: k.name, hd: k.hd, nextLevel: k.nextLevel })),
    [adjustedClassPlan],
  );

  // ── Ability increase state ───────────────────────────────────────

  const [abilityIncreases, setAbilityIncreases] = useState<
    Record<number, string | null>
  >({});

  // ── Form (for steps 3-6) ─────────────────────────────────────────

  const { getValues, setValue, reset, watch } = useForm<LevelUpFormData>({
    defaultValues: {
      selectedClass: null,
      selectedHP: null,
      selectedAttribute: null,
      selectedFeats: {},
      selectedPowers: {},
      skillPointAllocations: {},
    },
    mode: "onChange",
  });

  const selectedFeats = watch("selectedFeats");
  const selectedPowers = watch("selectedPowers");
  const skillPointAllocations = watch("skillPointAllocations");

  // ── UI state ─────────────────────────────────────────────────────

  const [selectedAptitude, setSelectedAptitude] = useState<string | null>(null);
  const [selectedPowerAptitude, setSelectedPowerAptitude] = useState<
    string | null
  >(null);
  const [selectedPowerLevel, setSelectedPowerLevel] = useState<number | null>(
    null,
  );
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [featSearch, setFeatSearch] = useState("");
  const debouncedFeatSearch = useDebouncedValue(featSearch);
  const [expandedFeatFamilies, setExpandedFeatFamilies] = useState<Set<string>>(
    new Set(),
  );
  const [powerSearch, setPowerSearch] = useState("");
  const debouncedPowerSearch = useDebouncedValue(powerSearch);
  const [validationErrors, setValidationErrors] = useState<
    ApiValidationIssue[]
  >([]);

  // ── Derived: valid class count and class plan key ────────────────

  const validClassCount = useMemo(
    () => classPlan.filter((k) => k !== null).length,
    [classPlan],
  );

  const classPlanKey = useMemo(() => {
    const entries = adjustedClassPlan
      .filter((k): k is SelectedKlass => k !== null)
      .map((k) => `${k.id}:${k.nextLevel}`)
      .sort();
    return entries.join("|");
  }, [adjustedClassPlan]);

  const prevClassPlanKey = useRef(classPlanKey);
  useEffect(() => {
    prevClassPlanKey.current = classPlanKey;
  }, [classPlanKey]);

  // ── Preview query ────────────────────────────────────────────────

  const previewQuery = useQuery({
    queryKey: queryKeys.characters.levelUp.preview(
      characterId,
      classPlanKey,
    ),
    queryFn: async () => {
      const levels = adjustedClassPlan
        .filter((k): k is SelectedKlass => k !== null)
        .map((k) => ({ klassId: k.id, level: k.nextLevel }));

      // Ability increases are applied client-side (see attributeData /
      // perLevelSkillPoints memos). Sending nulls keeps the server response
      // deterministic per classPlanKey — otherwise, a refetch triggered by a
      // classPlanKey change would read current abilityIncreases via closure,
      // server would apply the bump, and the client memo would double-count.
      const abilityIds = levels.map(() => null);

      const response = await rpc.api.characters.levels[":characterId"][
        "preview"
      ]["$post"]({
        param: { characterId },
        json: { levels, abilityIds },
      });
      if (!response.ok) throw response;
      return response.json();
    },
    enabled: open && validClassCount >= 1 && activeStep > 0,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });

  // ── Attribute data (from preview) ────────────────────────────────

  const abilityIncreaseLevels = useMemo(
    () => previewQuery.data?.attributes.abilityIncreaseLevels ?? [],
    [previewQuery.data],
  );

  const attributeData = useMemo(() => {
    if (!previewQuery.data) return undefined;
    if (abilityIncreaseLevels.length === 0) {
      return { isAvailable: false as const, attributes: {} };
    }

    // Adjust attributes client-side for user-selected ability increases
    // (preview is cached per class plan only, doesn't refire on ability changes).
    const baseAttrs = previewQuery.data.attributes.attributes;
    const increaseCounts: Record<string, number> = {};
    for (const abilityId of Object.values(abilityIncreases)) {
      if (abilityId) increaseCounts[abilityId] = (increaseCounts[abilityId] ?? 0) + 1;
    }

    const adjusted = Object.fromEntries(
      Object.entries(baseAttrs).map(([key, attr]) => {
        const bonus = increaseCounts[attr.abilityId] ?? 0;
        if (bonus === 0) return [key, attr];
        const newTotal = attr.total + bonus;
        return [key, { ...attr, level: attr.level + bonus, total: newTotal, modifier: Math.floor((newTotal - 10) / 2) }];
      }),
    );

    return {
      isAvailable: true as const,
      attributes: adjusted,
    };
  }, [previewQuery.data, abilityIncreaseLevels, abilityIncreases]);

  const isLoadingAttributes = previewQuery.isLoading;
  const attributesError = previewQuery.error;

  // ── Skill data (from preview) ────────────────────────────────────

  const perLevelClassSkillIds = previewQuery.data?.perLevelClassSkillIds;

  // Adjust skill points client-side when INT is increased (preview is cached per class plan only).
  // D&D 3.5: INT increases retroactively grant skill points for all levels.
  // Returns the modifier delta vs the preview's INT mod, plus context needed to
  // adjust both the per-level array and the wizard-wide skillPointsToSpend total.
  const intModAdjustment = useMemo(() => {
    const attrs = previewQuery.data?.attributes.attributes;
    const intAttr = attrs?.["intelligence"];
    if (!intAttr) return null;
    const intIncreases = Object.values(abilityIncreases).filter((id) => id === intAttr.abilityId).length;
    if (intIncreases === 0) return null;
    const newIntMod = Math.floor((intAttr.total + intIncreases - 10) / 2);
    const modDelta = newIntMod - intAttr.modifier;
    if (modDelta === 0) return null;
    return { modDelta };
  }, [previewQuery.data, abilityIncreases]);

  const perLevelSkillPoints = useMemo(() => {
    const base = previewQuery.data?.perLevelSkillPoints;
    if (!base) return undefined;
    if (!intModAdjustment) return base;
    const { modDelta } = intModAdjustment;
    // Adjust each level: ×4 for first character level, ×1 for others
    const existingLevelCount = (previewQuery.data?.skills.totalCharacterLevel ?? base.length) - base.length;
    return base.map((sp, i) => {
      const isFirstCharacterLevel = existingLevelCount === 0 && i === 0;
      return Math.max(1, sp + modDelta * (isFirstCharacterLevel ? 4 : 1));
    });
  }, [previewQuery.data, intModAdjustment]);

  // Mirror the per-level adjustment on the total ceiling. Without this, the
  // skills step's "X / Y" cap stays at the pre-bump value and silently caps
  // user input below what the bump should actually grant. modDelta × (n + 3)
  // covers all character levels (existing + batch), with +3 accounting for
  // level 1's ×4 multiplier (4 - 1 extra).
  const skillData = useMemo(() => {
    const base = previewQuery.data?.skills ?? null;
    if (!base) return null;
    if (!intModAdjustment) return base;
    const { modDelta } = intModAdjustment;
    const totalCharacterLevel = base.totalCharacterLevel;
    const adjustedTotal = base.skillPointsToSpend + modDelta * (totalCharacterLevel + 3);
    return { ...base, skillPointsToSpend: Math.max(1, adjustedTotal) };
  }, [previewQuery.data, intModAdjustment]);

  const isLoadingSkills = previewQuery.isLoading;
  const skillsError = previewQuery.error;

  // ── Feat data (from preview) ─────────────────────────────────────

  const featData = useMemo(
    () => previewQuery.data?.feats ?? null,
    [previewQuery.data],
  );

  const isLoadingFeats = previewQuery.isLoading;
  const featsError = previewQuery.error;

  // ── Power data (from preview) ────────────────────────────────────

  const powerData = useMemo(
    () => previewQuery.data?.powers ?? null,
    [previewQuery.data],
  );

  const isLoadingPowers = previewQuery.isLoading;
  const powersError = previewQuery.error;

  // ── Pending level context for feat/power queries ─────────────────

  const allKlassLevelIds = useMemo(() => {
    if (!previewQuery.data?.levelDetails) return undefined;
    const ids = previewQuery.data.levelDetails.map(
      (d) => d.klassLevelId,
    );
    return ids.length > 0 ? ids.join(",") : undefined;
  }, [previewQuery.data?.levelDetails]);

  const allSelectedFeatPickString = useMemo(() => {
    const pairs = Object.entries(selectedFeats).flatMap(([aptitudeId, feats]) =>
      feats.map((f) => `${f.id}:${aptitudeId}`),
    );
    return pairs.length > 0 ? pairs.sort().join(",") : undefined;
  }, [selectedFeats]);

  // ── Current slot level context (for feat/power queries) ──────────

  const firstClass = useMemo(
    () => adjustedClassPlan.find((k): k is SelectedKlass => k !== null) ?? null,
    [adjustedClassPlan],
  );

  const lastLevel = useMemo(() => {
    const validClasses = adjustedClassPlan.filter(
      (k): k is SelectedKlass => k !== null,
    );
    return validClasses.length > 0
      ? validClasses[validClasses.length - 1].nextLevel
      : 1;
  }, [adjustedClassPlan]);

  // For feat queries: determine which level in the plan the next pick lands
  // on so prerequisites are evaluated at the correct character state.
  const currentFeatSlotLevelIndex = useMemo(() => {
    const preview = previewQuery.data;
    if (!preview || !selectedAptitude) return 0;
    const slots = preview.perLevelFeatSlots[selectedAptitude] ?? [];
    const selectedCount = (selectedFeats[selectedAptitude] ?? []).length;
    let counted = 0;
    for (let i = 0; i < slots.length; i++) {
      counted += slots[i];
      if (counted > selectedCount) return i;
    }
    return Math.max(0, slots.length - 1);
  }, [previewQuery.data, selectedAptitude, selectedFeats]);

  // ── Grouped available feats query ────────────────────────────────

  // Use the slot-level context: query available feats at the specific level
  // where the next pick will land, not the final planned level.
  const slotLevelDetail = previewQuery.data?.levelDetails[currentFeatSlotLevelIndex];
  const pendingKlassLevelIdsUpToSlot = useMemo(() => {
    const details = previewQuery.data?.levelDetails;
    if (!details) return undefined;
    const ids = details.slice(0, currentFeatSlotLevelIndex + 1).map((d) => d.klassLevelId);
    return ids.length > 0 ? ids.join(",") : undefined;
  }, [previewQuery.data?.levelDetails, currentFeatSlotLevelIndex]);

  const pendingAbilityIdsUpToSlot = useMemo(() => {
    const details = previewQuery.data?.levelDetails;
    if (!details) return undefined;
    const ids = details.slice(0, currentFeatSlotLevelIndex + 1).map((_, i) =>
      abilityIncreases[i] ?? "null",
    );
    return ids.join(",");
  }, [previewQuery.data?.levelDetails, currentFeatSlotLevelIndex, abilityIncreases]);

  const {
    data: groupedFeatsData,
    isLoading: isLoadingAvailableFeats,
    fetchNextPage: fetchNextFeatsPage,
    hasNextPage: hasNextFeatsPage,
    isFetchingNextPage: isFetchingNextFeatsPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.characters.levelUp.availableFeatsGrouped(
      characterId,
      selectedAptitude,
      slotLevelDetail?.klassId ?? firstClass?.id,
      debouncedFeatSearch,
      undefined, // no editingLevelId
      allSelectedFeatPickString,
      pendingKlassLevelIdsUpToSlot,
      allSelectedFeatPickString,
    ),
    queryFn: async ({ pageParam }) => {
      if (!selectedAptitude || !slotLevelDetail)
        throw new Error("No aptitude or level detail available");
      const response = await rpc.api.characters.levels[":characterId"][
        "available-feats"
      ]["grouped"]["$get"]({
        param: { characterId },
        query: {
          aptitudeId: selectedAptitude,
          klassId: slotLevelDetail.klassId,
          level: slotLevelDetail.level.toString(),
          limit: "20",
          page: pageParam.toString(),
          ...(debouncedFeatSearch && { search: debouncedFeatSearch }),
          ...(allSelectedFeatPickString && {
            selectedFeatPicks: allSelectedFeatPickString,
          }),
          ...(pendingKlassLevelIdsUpToSlot && {
            pendingLevelKlassLevelIds: pendingKlassLevelIdsUpToSlot,
          }),
          ...(pendingAbilityIdsUpToSlot && {
            pendingLevelAbilityIds: pendingAbilityIdsUpToSlot,
          }),
          ...(allSelectedFeatPickString && {
            pendingLevelFeatPicks: allSelectedFeatPickString,
          }),
        },
      });
      if (!response.ok) throw response;
      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled:
      open &&
      activeStep === featsStep &&
      !!selectedAptitude &&
      !!slotLevelDetail,
  });

  const groupedFeats = useMemo(
    () => groupedFeatsData?.pages.flatMap((p) => p.items) ?? [],
    [groupedFeatsData?.pages],
  );

  const toggleFeatFamily = useCallback((family: string) => {
    setExpandedFeatFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(family)) {
        next.delete(family);
      } else {
        next.add(family);
      }
      return next;
    });
  }, []);

  const handleFeatsScroll = useCallback(
    (event: React.UIEvent<HTMLElement>) => {
      const target = event.target as HTMLElement;
      const bottom =
        target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
      if (bottom && hasNextFeatsPage && !isFetchingNextFeatsPage) {
        fetchNextFeatsPage();
      }
    },
    [hasNextFeatsPage, isFetchingNextFeatsPage, fetchNextFeatsPage],
  );

  // ── Available powers query ───────────────────────────────────────

  const {
    data: availablePowersData,
    isLoading: isLoadingAvailablePowers,
    fetchNextPage: fetchNextPowersPage,
    hasNextPage: hasNextPowersPage,
    isFetchingNextPage: isFetchingNextPowersPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.characters.levelUp.availablePowers(
      characterId,
      selectedPowerAptitude,
      selectedPowerLevel,
      firstClass?.id,
      debouncedPowerSearch,
      undefined, // no editingLevelId
      allSelectedFeatPickString,
      allKlassLevelIds,
      // All feat picks are "pending" (none are persisted yet),
      // so selectedFeatPicks and pendingLevelFeatPicks are the same set.
      allSelectedFeatPickString,
    ),
    queryFn: async ({ pageParam }) => {
      if (!selectedPowerAptitude || !firstClass)
        throw new Error("No aptitude or class selected");
      const response = await rpc.api.characters.levels[":characterId"][
        "available-powers"
      ]["$get"]({
        param: { characterId },
        query: {
          aptitudeId: selectedPowerAptitude,
          klassId: firstClass.id,
          level: lastLevel.toString(),
          ...(selectedPowerLevel != null && {
            powerLevel: selectedPowerLevel.toString(),
          }),
          limit: "20",
          page: pageParam.toString(),
          ...(debouncedPowerSearch && { search: debouncedPowerSearch }),
          ...(allSelectedFeatPickString && {
            selectedFeatPicks: allSelectedFeatPickString,
          }),
          ...(allKlassLevelIds && {
            pendingLevelKlassLevelIds: allKlassLevelIds,
          }),
          ...(allSelectedFeatPickString && {
            pendingLevelFeatPicks: allSelectedFeatPickString,
          }),
        },
      });
      if (!response.ok) throw response;
      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled:
      open &&
      activeStep === powersStep &&
      !!selectedPowerAptitude &&
      !!firstClass,
  });

  const availablePowers = useMemo(
    () => availablePowersData?.pages.flatMap((p) => p.items) ?? [],
    [availablePowersData?.pages],
  );

  const handlePowersScroll = useCallback(
    (event: React.UIEvent<HTMLElement>) => {
      const target = event.target as HTMLElement;
      const bottom =
        target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
      if (bottom && hasNextPowersPage && !isFetchingNextPowersPage) {
        fetchNextPowersPage();
      }
    },
    [hasNextPowersPage, isFetchingNextPowersPage, fetchNextPowersPage],
  );

  // ── Computed: adjusted feat pools ────────────────────────────────

  const adjustedFeatPools = useMemo(() => {
    if (!featData?.aptitudePools) return {};
    const pools = { ...featData.aptitudePools } as Record<
      string,
      AptitudePool
    >;

    const adjustments = new Map<string, number>();
    for (const feats of Object.values(selectedFeats)) {
      for (const feat of feats) {
        for (const mod of feat.aptitudeModifiers ?? []) {
          if (mod.operator === "add") {
            adjustments.set(
              mod.aptitudeId,
              (adjustments.get(mod.aptitudeId) ?? 0) + mod.value,
            );
          }
        }
      }
    }

    for (const [aptitudeId, delta] of adjustments) {
      if (pools[aptitudeId]) {
        pools[aptitudeId] = {
          ...pools[aptitudeId],
          allowed: pools[aptitudeId].allowed + delta,
          available: pools[aptitudeId].available + delta,
        };
      }
    }

    return pools;
  }, [featData?.aptitudePools, selectedFeats]);

  // Trim feat selections when pool shrinks
  useEffect(() => {
    let changed = false;
    const currentFeats = getValues("selectedFeats");
    const updated = { ...currentFeats };
    for (const [poolId, feats] of Object.entries(updated)) {
      const pool = adjustedFeatPools[poolId];
      const max = pool ? Math.max(0, pool.available) : 0;
      if (feats.length > max) {
        updated[poolId] = feats.slice(0, max);
        changed = true;
      }
    }
    if (changed) setValue("selectedFeats", updated);
    if (
      selectedAptitude &&
      adjustedFeatPools[selectedAptitude]?.available !== undefined &&
      adjustedFeatPools[selectedAptitude].available <= 0
    ) {
      setSelectedAptitude(null);
    }
  }, [adjustedFeatPools, getValues, setValue, selectedAptitude, setSelectedAptitude]);

  // Trim power selections when pools shrink
  useEffect(() => {
    if (!powerData?.aptitudePools) return;
    let changed = false;
    const currentPowers = getValues("selectedPowers");
    const updated = { ...currentPowers };
    for (const [poolId, powers] of Object.entries(updated)) {
      const pool = powerData.aptitudePools[poolId];
      if (!pool) {
        if (powers.length > 0) { updated[poolId] = []; changed = true; }
        continue;
      }
      if (pool.leveled && pool.levels) {
        const trimmed = [...powers];
        let levelChanged = false;
        for (const [level, levelData] of Object.entries(pool.levels)) {
          const lvl = Number(level);
          const atLevel = trimmed.filter((p) => p.powerLevel === lvl);
          if (atLevel.length > levelData.available) {
            const excess = atLevel.length - levelData.available;
            let removed = 0;
            for (let i = trimmed.length - 1; i >= 0 && removed < excess; i--) {
              if (trimmed[i].powerLevel === lvl) { trimmed.splice(i, 1); removed++; }
            }
            levelChanged = true;
          }
        }
        if (levelChanged) { updated[poolId] = trimmed; changed = true; }
      } else {
        const max = Math.max(0, pool.available);
        if (powers.length > max) {
          updated[poolId] = powers.slice(0, max);
          changed = true;
        }
      }
    }
    if (changed) setValue("selectedPowers", updated);
  }, [powerData?.aptitudePools, getValues, setValue]);

  // Trim skill allocations when pool shrinks
  useEffect(() => {
    if (!skillData || !perLevelClassSkillIds || !perLevelSkillPoints) return;
    const allocs = getValues("skillPointAllocations");
    if (Object.keys(allocs).length === 0) return;

    let changed = false;
    const updated: Record<string, number> = {};
    let total = 0;

    for (const [skillId, points] of Object.entries(allocs)) {
      const skill = skillData.skills.find((s) => s.id === skillId);
      if (!skill || points <= 0) continue;

      const maxRank = skill.isClassSkill
        ? skillData.totalCharacterLevel + 3
        : (skillData.totalCharacterLevel + 3) / 2;
      const maxRanksCanAdd = maxRank - skill.currentRank;
      const maxFromLevel = computeMaxPointsForSkill(
        skillId, maxRanksCanAdd, perLevelClassSkillIds, perLevelSkillPoints,
      );
      const maxFromAvailable = skillData.skillPointsToSpend - total;
      const clamped = Math.min(points, maxFromLevel, maxFromAvailable);

      if (clamped > 0) {
        updated[skillId] = clamped;
        total += clamped;
      }
      if (clamped !== points) changed = true;
    }

    if (changed) setValue("skillPointAllocations", updated);
  }, [skillData, perLevelClassSkillIds, perLevelSkillPoints, getValues, setValue]);

  // ── Computed: power pool helpers ─────────────────────────────────

  // ── Handlers ─────────────────────────────────────────────────────

  const handleDeleteFeat = useCallback(
    (featId: string, aptitudeId: string) => {
      setValue("selectedFeats", {
        ...selectedFeats,
        [aptitudeId]: (selectedFeats[aptitudeId] || []).filter(
          (f) => f.id !== featId,
        ),
      });
    },
    [selectedFeats, setValue],
  );

  const handleDeletePower = useCallback(
    (powerId: string, aptitudeId: string) => {
      setValue("selectedPowers", {
        ...selectedPowers,
        [aptitudeId]: (selectedPowers[aptitudeId] || []).filter(
          (p) => p.id !== powerId,
        ),
      });
    },
    [selectedPowers, setValue],
  );

  // ── Finalize mutation ────────────────────────────────────────────

  const finalizeMutation = useMutation({
    mutationFn: async ({
      levels,
      skills,
      feats,
      powers,
      force = false,
    }: {
      levels: Array<{ klassId: string; level: number; hp: number; abilityId: string | null }>;
      skills: Record<string, number>;
      feats: Record<string, string[]>;
      powers: Record<string, string[]>;
      force?: boolean;
    }) => {
      const response = await rpc.api.characters.levels[":characterId"][
        "finalize"
      ]["$post"]({
        param: { characterId },
        json: { levels, skills, feats, powers, force },
      });
      if (!response.ok) {
        const body = await response.json();
        throw new ApiError(
          "message" in body ? body.message : "Failed to finalize levels",
          response.status,
          "error" in body ? body.error : "BadRequestError",
          "issues" in body ? body.issues : undefined,
        );
      }
      return response.json();
    },
    onSuccess: async () => {
      queryClient.removeQueries({
        queryKey: queryKeys.characters.levelUp.all(characterId),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.characters.detail(characterId),
      });
      snackbar.success(`Added ${classPlan.filter((k) => k !== null).length} levels`);
      resetWizard();
      onClose();
    },
    onError: (error) => {
      if (
        error instanceof ApiError &&
        error.issues &&
        error.issues.length > 0
      ) {
        setValidationErrors(error.issues);
      } else {
        snackbar.error(error, "Failed to finalize level up");
      }
    },
  });

  // ── Navigation ───────────────────────────────────────────────────

  const handleNext = useCallback(() => {
    if (activeStep === addStepContent.length - 1) {
      // Review step — submit pool-level data; backend distributes to per-level payloads
      const preview = previewQuery.data;
      if (!preview) return;

      const selectedFeats = getValues("selectedFeats");
      const selectedPowers = getValues("selectedPowers");

      finalizeMutation.mutate({
        levels: preview.levelDetails.map((d, i) => ({
          klassId: d.klassId,
          level: d.level,
          hp: hpValues[i] ?? 1,
          abilityId: abilityIncreases[i] ?? null,
        })),
        skills: getValues("skillPointAllocations"),
        feats: Object.fromEntries(
          Object.entries(selectedFeats).map(([aptId, feats]) => [aptId, feats.map((f) => f.id)]),
        ),
        powers: Object.fromEntries(
          Object.entries(selectedPowers).map(([aptId, powers]) => [aptId, powers.map((p) => p.id)]),
        ),
        force: false,
      });
    } else {
      setActiveStep((prev) => prev + 1);
    }
  }, [
    activeStep,
    previewQuery.data,
    hpValues,
    abilityIncreases,
    getValues,
    finalizeMutation,
  ]);

  const handleForceSubmit = useCallback(() => {
    setValidationErrors([]);
    const preview = previewQuery.data;
    if (!preview) return;

    const selectedFeats = getValues("selectedFeats");
    const selectedPowers = getValues("selectedPowers");

    finalizeMutation.mutate({
      levels: preview.levelDetails.map((d, i) => ({
        klassId: d.klassId,
        level: d.level,
        hp: hpValues[i] ?? 1,
        abilityId: abilityIncreases[i] ?? null,
      })),
      skills: getValues("skillPointAllocations"),
      feats: Object.fromEntries(
        Object.entries(selectedFeats).map(([aptId, feats]) => [aptId, feats.map((f) => f.id)]),
      ),
      powers: Object.fromEntries(
        Object.entries(selectedPowers).map(([aptId, powers]) => [aptId, powers.map((p) => p.id)]),
      ),
      force: true,
    });
  }, [
    previewQuery.data,
    hpValues,
    abilityIncreases,
    getValues,
    finalizeMutation,
  ]);

  const handleBack = useCallback(() => {
    setValidationErrors([]);
    setActiveStep((prev) => prev - 1);
  }, []);

  const resetWizard = useCallback(() => {
    setShowCancelConfirm(false);
    reset();
    slotCounter.current = 0;
    setSlotKeys([]);
    setClassPlan([]);
    setHpValues([]);
    setAbilityIncreases({});
    setSelectedAptitude(null);
    setSelectedPowerAptitude(null);
    setSelectedPowerLevel(null);
    setFeatSearch("");
    setExpandedFeatFamilies(new Set());
    setPowerSearch("");
    setValidationErrors([]);
    setActiveStep(0);
  }, [reset]);

  const hasProgress = activeStep > 0 || classPlan.some((k) => k !== null);

  const handleCancel = useCallback(() => {
    if (hasProgress) {
      setShowCancelConfirm(true);
    } else {
      onClose();
    }
  }, [hasProgress, onClose]);

  const handleConfirmCancel = useCallback(() => {
    resetWizard();
    onClose();
  }, [resetWizard, onClose]);

  // ── isNextDisabled logic ─────────────────────────────────────────

  const isNextDisabled = useMemo(() => {
    if (finalizeMutation.isPending) return true;

    const content = addStepContent[activeStep];
    switch (content) {
      case "class-plan":
        return validClassCount < 1;
      case "hp":
        return hpValues.some((v) => v === null);
      default:
        return false;
    }
  }, [
    finalizeMutation.isPending,
    activeStep,
    validClassCount,
    hpValues,
  ]);

  // ── Next button label ────────────────────────────────────────────

  const nextButtonLabel = useMemo(() => {
    if (activeStep === addStepContent.length - 1) return "Finish All";
    return "Next";
  }, [activeStep]);

  // ── Return ───────────────────────────────────────────────────────

  return {
    // Stepper
    activeStep,
    setActiveStep,

    // Class plan (step 1)
    classPlan: adjustedClassPlan,
    slotKeys,
    handleClassChange,
    handleAddLevel,
    handleQuickAddLevel,
    handleRemoveLevel,

    // HP (step 2)
    hpValues,
    handleHpChange,
    handleHpRoll,
    handleHpRollAll,
    handleHpMaxAll,
    hpLevels,

    // Attributes (step 3)
    attributeData,
    isLoadingAttributes,
    attributesError,
    abilityIncreaseLevels,
    abilityIncreases,
    setAbilityIncreases,

    // Skills (step 4)
    skillData,
    isLoadingSkills,
    skillsError,
    skillPointAllocations,
    perLevelClassSkillIds,
    perLevelSkillPoints,
    setValue,

    // Feats (step 5)
    featData,
    isLoadingFeats,
    featsError,
    adjustedFeatPools,
    selectedFeats,
    selectedAptitude,
    setSelectedAptitude,
    groupedFeats,
    isLoadingAvailableFeats,
    isFetchingNextFeatsPage,
    expandedFeatFamilies,
    toggleFeatFamily,
    allSelectedFeatPickString,
    allKlassLevelIds,
    featSearch,
    setFeatSearch,
    handleFeatsScroll,
    handleDeleteFeat,

    // Powers (step 6)
    powerData,
    isLoadingPowers,
    powersError,
    selectedPowers,
    selectedPowerAptitude,
    selectedPowerLevel,
    setSelectedPowerAptitude,
    setSelectedPowerLevel,
    availablePowers,
    isLoadingAvailablePowers,
    isFetchingNextPowersPage,
    powerSearch,
    setPowerSearch,
    handlePowersScroll,
    handleDeletePower,

    // Navigation
    handleNext,
    handleBack,
    handleCancel,
    handleConfirmCancel,
    handleForceSubmit,
    isNextDisabled,
    nextButtonLabel,

    // UI state
    showCancelConfirm,
    setShowCancelConfirm,
    validationErrors,
    setValidationErrors,

    // Mutation
    finalizeMutation,

    // Sections
    levelUpSections,

    // Preview
    preview: previewQuery.data,
    isLoadingPreview: previewQuery.isLoading,
    levelDetails: previewQuery.data?.levelDetails ?? [],
  };
}

export type AddLevelWizard = ReturnType<typeof useAddLevelWizard>;
