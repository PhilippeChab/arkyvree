import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { useDebouncedValue, useIsMobile } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import {
  ApiError,
  type ApiValidationIssue,
  type RPC,
  rpc,
} from "@/client/src/services/rpc.ts";
import { rollDie } from "@/client/src/lib/dice.ts";
import {
  useInfiniteQuery,
  useMutation,

  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { type InferResponseType } from "hono/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { getLevelUpSections } from "../levelUpFactory.ts";

// ── Shared types ──────────────────────────────────────────────────────

type AvailableKlassesResponse = InferResponseType<
  RPC["api"]["characters"]["levels"][":characterId"]["available-classes"]["$get"]
>;
type AvailableKlass = Exclude<
  AvailableKlassesResponse,
  { error: string; cause: string; message: string }
>["items"][number];

type LeveledUpAttributesResponse = InferResponseType<
  RPC["api"]["characters"]["levels"][":characterId"]["attribute-slots"]["$get"]
>;
type LeveledUpAttribute = Exclude<
  LeveledUpAttributesResponse,
  { error: string; cause: string; message: string }
>["attributes"];

type LeveledUpFeatsResponse = InferResponseType<
  RPC["api"]["characters"]["levels"][":characterId"]["feat-slots"]["$get"]
>;

type AptitudePool = LeveledUpFeatsResponse extends {
  aptitudePools: Record<string, infer T>;
}
  ? T
  : {
      id: string;
      name: string;
      allowed: number;
      spent: number;
      available: number;
      shared: boolean;
    };

type AvailableFeatsResponse = InferResponseType<
  RPC["api"]["characters"]["levels"][":characterId"]["available-feats"]["$get"]
>;
type AvailableFeatsPaginated = Exclude<
  AvailableFeatsResponse,
  { error: string; cause: string; message: string }
>;
type AvailableFeat = AvailableFeatsPaginated["items"][number];

type LeveledUpPowersResponse = InferResponseType<
  RPC["api"]["characters"]["levels"][":characterId"]["power-slots"]["$get"]
>;

type PowerAptitudePool = LeveledUpPowersResponse extends {
  aptitudePools: Record<string, infer T>;
}
  ? T
  : {
      id: string;
      name: string;
      allowed: number;
      spent: number;
      available: number;
      leveled?: boolean;
      levels?: Record<
        string,
        { allowed: number; spent: number; available: number }
      >;
    };

type CharacterResponse = InferResponseType<
  RPC["api"]["characters"][":id"]["$get"],
  200
>;
type BaseRules = NonNullable<CharacterResponse["baseRules"]>;

interface AptitudeModifier {
  aptitudeId: string;
  value: number;
  operator: string;
}

interface SelectedFeat {
  id: string;
  name: string;
  description?: string;
  aptitudeModifiers?: AptitudeModifier[];
}

type SelectedKlass = Pick<
  AvailableKlass,
  "id" | "name" | "nextLevel" | "maxLevel" | "hd" | "eligible"
>;

interface LevelUpFormData {
  selectedClass: SelectedKlass | null;
  selectedHP: number | null;
  selectedAttribute: string | null;
  selectedFeats: Record<string, SelectedFeat[]>;
  selectedPowers: Record<
    string,
    Array<{ id: string; name: string; description?: string; powerLevel?: number }>
  >;
  skillPointAllocations: Record<string, number>;
}

export type {
  AvailableKlass,
  AvailableFeat,
  AptitudePool,
  AptitudeModifier,
  SelectedFeat,
  SelectedKlass,
  LevelUpFormData,
  LeveledUpAttribute,
  PowerAptitudePool,
  BaseRules,
};

// ── Step content types ────────────────────────────────────────────────

export const editStepContent = [
  "hp",
  "attributes",
  "skills",
  "feats",
  "powers",
  "review",
] as const;

export const editStepLabels = [
  "Select HP",
  "Attribute Increase",
  "Select Skills",
  "Select Feats",
  "Select Spells",
  "Review Changes",
];

// ── Hook ──────────────────────────────────────────────────────────────

interface UseLevelWizardParams {
  open: boolean;
  onClose: () => void;
  characterId: string;
  baseRules: BaseRules;
  editingLevelId: string;
  stepContent: readonly string[];
  onReset?: () => void;
}

export function useLevelWizard({
  open,
  onClose,
  characterId,
  baseRules,
  editingLevelId,
  stepContent,
  onReset,
}: UseLevelWizardParams) {
  const isMobile = useIsMobile();
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const levelUpSections = getLevelUpSections(baseRules);

  // Step index mapping
  const attributeStep = stepContent.indexOf("attributes");
  const skillsStep = stepContent.indexOf("skills");
  const featsStep = stepContent.indexOf("feats");
  const powersStep = stepContent.indexOf("powers");

  // ── Stepper ───────────────────────────────────────────────────────
  const [activeStep, setActiveStep] = useState(0);

  // ── UI state ──────────────────────────────────────────────────────
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
  const [expandedFeatFamilies, setExpandedFeatFamilies] = useState<
    Set<string>
  >(new Set());
  const [powerSearch, setPowerSearch] = useState("");
  const debouncedPowerSearch = useDebouncedValue(powerSearch);
  const [validationErrors, setValidationErrors] = useState<
    ApiValidationIssue[]
  >([]);

  // ── HP roll animation ─────────────────────────────────────────────
  const [hpRolling, setHpRolling] = useState(false);
  const [hpSettled, setHpSettled] = useState(false);
  const [hpDisplayValue, setHpDisplayValue] = useState<number | null>(null);
  const hpIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hpTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanupHpRoll = useCallback(() => {
    if (hpIntervalRef.current) {
      clearInterval(hpIntervalRef.current);
      hpIntervalRef.current = null;
    }
    if (hpTimeoutRef.current) {
      clearTimeout(hpTimeoutRef.current);
      hpTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => cleanupHpRoll, [cleanupHpRoll]);

  // ── Form ──────────────────────────────────────────────────────────
  const { handleSubmit, getValues, setValue, reset, watch } =
    useForm<LevelUpFormData>({
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

  const selectedClass = watch("selectedClass");
  const selectedHP = watch("selectedHP");
  const selectedAttribute = watch("selectedAttribute");
  const selectedFeats = watch("selectedFeats");
  const selectedPowers = watch("selectedPowers");
  const skillPointAllocations = watch("skillPointAllocations");

  const allSelectedFeatPickString = useMemo(() => {
    const pairs = Object.entries(selectedFeats).flatMap(([aptitudeId, feats]) =>
      feats.map((f) => `${f.id}:${aptitudeId}`),
    );
    return pairs.length > 0 ? pairs.sort().join(",") : undefined;
  }, [selectedFeats]);

  // ── Queries ───────────────────────────────────────────────────────

  const {
    data: attributeData,
    isLoading: isLoadingAttributes,
    error: attributesError,
  } = useQuery({
    queryKey: queryKeys.characters.levelUp.attributes(
      characterId,
      editingLevelId,
    ),
    queryFn: async () => {
      const response = await rpc.api.characters.levels[":characterId"][
        "attribute-slots"
      ]["$get"]({
        param: { characterId },
        query: {
          characterLevelId: editingLevelId,
        },
      });
      if (!response.ok) throw response;
      return response.json();
    },
    enabled: open && activeStep === attributeStep,
  });

  const {
    data: skillData,
    isLoading: isLoadingSkills,
    error: skillsError,
  } = useQuery({
    queryKey: queryKeys.characters.levelUp.skills(
      characterId,
      selectedClass?.id,
      editingLevelId,
      selectedAttribute,
    ),
    queryFn: async () => {
      if (!selectedClass?.id) return null;
      const response = await rpc.api.characters.levels[":characterId"][
        "skill-slots"
      ]["$get"]({
        param: { characterId },
        query: {
          klassId: selectedClass.id,
          level: selectedClass.nextLevel.toString(),
          characterLevelId: editingLevelId,
          ...(selectedAttribute && { abilityId: selectedAttribute }),
        },
      });
      if (!response.ok) throw response;
      return response.json();
    },
    enabled: open && activeStep === skillsStep && !!selectedClass?.id,
  });

  const {
    data: featData,
    isLoading: isLoadingFeats,
    error: featsError,
  } = useQuery({
    queryKey: queryKeys.characters.levelUp.feats(
      characterId,
      selectedClass?.id,
      editingLevelId,
    ),
    queryFn: async () => {
      if (!selectedClass?.id) return null;
      const response = await rpc.api.characters.levels[":characterId"][
        "feat-slots"
      ]["$get"]({
        param: { characterId },
        query: {
          klassId: selectedClass.id,
          level: selectedClass.nextLevel.toString(),
          characterLevelId: editingLevelId,
        },
      });
      if (!response.ok) throw response;
      return response.json();
    },
    enabled: open && !!selectedClass?.id,
  });

  // Grouped available feats
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
      selectedClass?.id,
      debouncedFeatSearch,
      editingLevelId,
      allSelectedFeatPickString,
    ),
    queryFn: async ({ pageParam }) => {
      if (!selectedAptitude || !selectedClass)
        throw new Error("No aptitude or class selected");
      const response = await rpc.api.characters.levels[":characterId"][
        "available-feats"
      ]["grouped"]["$get"]({
        param: { characterId },
        query: {
          aptitudeId: selectedAptitude,
          klassId: selectedClass.id,
          level: selectedClass.nextLevel.toString(),
          limit: "20",
          page: pageParam.toString(),
          ...(debouncedFeatSearch && { search: debouncedFeatSearch }),
          characterLevelId: editingLevelId,
          ...(allSelectedFeatPickString && { selectedFeatPicks: allSelectedFeatPickString }),
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
      !!selectedClass,
  });

  const groupedFeats = useMemo(
    () => groupedFeatsData?.pages.flatMap((p) => p.items) ?? [],
    [groupedFeatsData?.pages],
  );

  const toggleFeatFamily = (family: string) => {
    setExpandedFeatFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(family)) {
        next.delete(family);
      } else {
        next.add(family);
      }
      return next;
    });
  };

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

  // Powers queries
  const {
    data: powerData,
    isLoading: isLoadingPowers,
    error: powersError,
  } = useQuery({
    queryKey: queryKeys.characters.levelUp.powers(
      characterId,
      selectedClass?.id,
      editingLevelId,
    ),
    queryFn: async () => {
      if (!selectedClass?.id) return null;
      const response = await rpc.api.characters.levels[":characterId"][
        "power-slots"
      ]["$get"]({
        param: { characterId },
        query: {
          klassId: selectedClass.id,
          level: selectedClass.nextLevel.toString(),
          characterLevelId: editingLevelId,
        },
      });
      if (!response.ok) throw response;
      return response.json();
    },
    enabled: open && !!selectedClass?.id,
  });

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
      selectedClass?.id,
      debouncedPowerSearch,
      editingLevelId,
      allSelectedFeatPickString,
    ),
    queryFn: async ({ pageParam }) => {
      if (!selectedPowerAptitude || !selectedClass)
        throw new Error("No aptitude or class selected");
      const response = await rpc.api.characters.levels[":characterId"][
        "available-powers"
      ]["$get"]({
        param: { characterId },
        query: {
          aptitudeId: selectedPowerAptitude,
          klassId: selectedClass.id,
          level: selectedClass.nextLevel.toString(),
          ...(selectedPowerLevel != null && {
            powerLevel: selectedPowerLevel.toString(),
          }),
          limit: "20",
          page: pageParam.toString(),
          ...(debouncedPowerSearch && { search: debouncedPowerSearch }),
          characterLevelId: editingLevelId,
          ...(allSelectedFeatPickString && { selectedFeatPicks: allSelectedFeatPickString }),
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
      !!selectedClass,
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

  // ── Computed: adjusted feat pools ─────────────────────────────────

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

  // ── Mutation ──────────────────────────────────────────────────────

  const finalizeMutation = useMutation({
    mutationFn: async ({ data, force = false }: { data: LevelUpFormData; force?: boolean }) => {
      if (!data.selectedHP) throw new Error("HP not selected");

      const featsPayload = Object.fromEntries(
        Object.entries(data.selectedFeats).map(([k, v]) => [
          k,
          v.map((f) => f.id),
        ]),
      );
      const powersPayload = Object.fromEntries(
        Object.entries(data.selectedPowers).map(([k, v]) => [
          k,
          v.map((p) => p.id),
        ]),
      );

      const response = await rpc.api.characters.levels[":characterId"][
        ":characterLevelId"
      ]["$put"]({
        param: { characterId, characterLevelId: editingLevelId },
        json: {
          hp: data.selectedHP,
          abilityId: data.selectedAttribute,
          skills: data.skillPointAllocations,
          feats: featsPayload,
          powers: powersPayload,
          force,
        },
      });
      if (!response.ok) throw new Error("Failed to update level");
      return response.json();
    },
    onSuccess: async () => {
      queryClient.removeQueries({
        queryKey: queryKeys.characters.levelUp.all(characterId),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.characters.detail(characterId),
      });
      onReset?.();
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

  // ── Handlers ──────────────────────────────────────────────────────

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

  const handleNext = useCallback(() => {
    if (activeStep === stepContent.length - 1) {
      handleSubmit((data) => finalizeMutation.mutate({ data }))();
    } else {
      setActiveStep((prev) => prev + 1);
    }
  }, [activeStep, stepContent.length, handleSubmit, finalizeMutation]);

  const handleForceSubmit = useCallback(() => {
    setValidationErrors([]);
    finalizeMutation.mutate({ data: getValues(), force: true });
  }, [finalizeMutation, getValues]);

  const handleBack = useCallback(() => {
    setValidationErrors([]);
    setActiveStep((prev) => prev - 1);
  }, []);

  const resetWizard = useCallback(() => {
    setShowCancelConfirm(false);
    reset();
    setSelectedAptitude(null);
    setSelectedPowerAptitude(null);
    setSelectedPowerLevel(null);
    setFeatSearch("");
    setExpandedFeatFamilies(new Set());
    setPowerSearch("");
    setValidationErrors([]);
    setActiveStep(0);
  }, [reset]);

  const handleCancel = useCallback(() => {
    setShowCancelConfirm(true);
  }, []);

  const handleConfirmCancel = useCallback(() => {
    onReset?.();
    resetWizard();
    onClose();
  }, [onReset, resetWizard, onClose]);

  // ── HP roll trigger ───────────────────────────────────────────────

  const triggerHpRoll = useCallback(
    (hd: number) => {
      if (hpRolling) return;
      cleanupHpRoll();
      setHpRolling(true);
      setHpSettled(false);

      hpIntervalRef.current = setInterval(() => {
        setHpDisplayValue(rollDie(hd));
      }, 50);

      hpTimeoutRef.current = setTimeout(() => {
        cleanupHpRoll();
        const result = rollDie(hd);
        setHpDisplayValue(result);
        setValue("selectedHP", result);
        setHpRolling(false);
        setHpSettled(true);
        hpTimeoutRef.current = setTimeout(() => setHpSettled(false), 400);
      }, 800);
    },
    [hpRolling, cleanupHpRoll, setValue],
  );

  // ── Next button disabled logic ────────────────────────────────────

  const isNextDisabled = useMemo(() => {
    if (finalizeMutation.isPending) return true;
    if (stepContent[activeStep] === "hp") return !selectedHP;
    return false;
  }, [finalizeMutation.isPending, stepContent, activeStep, selectedHP]);

  return {
    // Form values
    selectedClass,
    selectedHP,
    selectedAttribute,
    selectedFeats,
    selectedPowers,
    skillPointAllocations,
    setValue,
    getValues,

    // Stepper
    activeStep,
    setActiveStep,
    stepContent,

    // UI state
    isMobile,
    selectedAptitude,
    setSelectedAptitude,
    selectedPowerAptitude,
    setSelectedPowerAptitude,
    selectedPowerLevel,
    setSelectedPowerLevel,
    showCancelConfirm,
    setShowCancelConfirm,
    validationErrors,
    setValidationErrors,
    featSearch,
    setFeatSearch,
    expandedFeatFamilies,
    toggleFeatFamily,
    powerSearch,
    setPowerSearch,

    // HP roll
    hpRolling,
    hpSettled,
    hpDisplayValue,
    triggerHpRoll,

    // Queries
    attributeData,
    isLoadingAttributes,
    attributesError,
    skillData,
    isLoadingSkills,
    skillsError,
    featData,
    isLoadingFeats,
    featsError,
    groupedFeats,
    isLoadingAvailableFeats,
    isFetchingNextFeatsPage,
    powerData,
    isLoadingPowers,
    powersError,
    availablePowers,
    isLoadingAvailablePowers,
    isFetchingNextPowersPage,

    // Mutation
    finalizeMutation,

    // Handlers
    handleDeleteFeat,
    handleDeletePower,
    handleNext,
    handleBack,
    handleCancel,
    handleConfirmCancel,
    handleForceSubmit,
    handleFeatsScroll,
    handlePowersScroll,
    resetWizard,

    // Computed
    allSelectedFeatPickString,
    adjustedFeatPools,
    isNextDisabled,

    // Sections
    levelUpSections,
    baseRules,
  };
}

export type LevelWizard = ReturnType<typeof useLevelWizard>;
