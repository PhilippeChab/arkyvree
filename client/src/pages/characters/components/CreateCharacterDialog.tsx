import { AnimatedAlert, CreateDialog } from "@/client/src/components/common/index.ts";
import { useDebouncedValue, useRulesetAbilities } from "@/client/src/hooks/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { sortAbilities } from "@/client/src/lib/abilityOrder.ts";
import { settledPulse } from "@/client/src/lib/animations.ts";
import { getRollFunction, isDiceMethod, ROLL_METHODS, STANDARD_ARRAY, POINT_BUY_COSTS, POINT_BUY_TOTAL, type RollMethodId } from "@/client/src/lib/dice.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { ALIGNMENT_OPTIONS, GENDER_OPTIONS } from "@/shared/enums.ts";
import {
  Add as AddIcon,
  Casino as CasinoIcon,
  Remove as RemoveIcon,
} from "@mui/icons-material";
import {
  Autocomplete,
  Chip,
  FormControl,
  FormHelperText,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";
import { type Ref, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { type Control, useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { createListboxScrollHandler } from "@/client/src/lib/listboxScroll.ts";

type CreateCharacterFormData = InferRequestType<
  typeof rpc.api.characters.$post
>["json"];

function formatModifier(score: number): string {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

function AbilityCard({
  name,
  score,
  onIncrease,
  onDecrease,
  canIncrease,
  canDecrease,
  bottomInfo,
  isSettled,
}: {
  name: string;
  score: number;
  onIncrease: () => void;
  onDecrease: () => void;
  canIncrease: boolean;
  canDecrease: boolean;
  bottomInfo: string;
  isSettled?: boolean;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5, minWidth: 100, flex: "1 1 0", textAlign: "center",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "space-between", minHeight: 100,
        ...(isSettled && {
          animation: `${settledPulse} 0.4s cubic-bezier(0.4, 0, 0.2, 1)`,
        }),
      }}
    >
      <Typography variant="caption" sx={{
        color: "text.secondary"
      }}>{name}</Typography>
      <Stack
        direction="row"
        spacing={0.5}
        sx={{
          alignItems: "center",
          justifyContent: "center"
        }}>
        <IconButton size="small" onClick={onDecrease} disabled={!canDecrease}>
          <RemoveIcon fontSize="small" />
        </IconButton>
        <Typography variant="h6" sx={{ minWidth: 28 }}>{score}</Typography>
        <IconButton size="small" onClick={onIncrease} disabled={!canIncrease}>
          <AddIcon fontSize="small" />
        </IconButton>
      </Stack>
      <Typography variant="caption" sx={{
        color: "text.secondary"
      }}>{bottomInfo}</Typography>
    </Paper>
  );
}

function StandardArrayScores({
  abilities,
  abilityValues,
  setValue,
}: {
  abilities: { id: string; name: string }[];
  abilityValues: Record<string, number> | undefined;
  setValue: (key: `abilities.${string}`, value: number) => void;
}) {
  const handleChange = (abilityId: string, newValue: number) => {
    if (!abilityValues) return;
    const swapId = abilities.find(
      (a) => a.id !== abilityId && abilityValues[a.id] === newValue,
    )?.id;
    if (swapId) {
      setValue(`abilities.${swapId}`, abilityValues[abilityId] ?? STANDARD_ARRAY[STANDARD_ARRAY.length - 1]);
    }
    setValue(`abilities.${abilityId}`, newValue);
  };

  const sortedAsc = useMemo(() => [...STANDARD_ARRAY].sort((a, b) => a - b), []);

  return (
    <Stack direction="row" spacing={2} useFlexGap sx={{
      flexWrap: "wrap"
    }}>
      {abilities.map((ability) => {
        const score = abilityValues?.[ability.id] ?? STANDARD_ARRAY[0];
        const idx = sortedAsc.indexOf(score);
        const canIncrease = idx !== -1 && idx < sortedAsc.length - 1;
        const canDecrease = idx > 0;

        return (
          <AbilityCard
            key={ability.id}
            name={ability.name}
            score={score}
            onIncrease={() => canIncrease && handleChange(ability.id, sortedAsc[idx + 1])}
            onDecrease={() => canDecrease && handleChange(ability.id, sortedAsc[idx - 1])}
            canIncrease={canIncrease}
            canDecrease={canDecrease}
            bottomInfo={`Mod: ${formatModifier(score)}`}
          />
        );
      })}
    </Stack>
  );
}

function PointBuyScores({
  abilities,
  abilityValues,
  setValue,
}: {
  abilities: { id: string; name: string }[];
  abilityValues: Record<string, number> | undefined;
  setValue: (key: `abilities.${string}`, value: number) => void;
}) {
  const pointsSpent = useMemo(() => {
    if (!abilityValues) return 0;
    return abilities.reduce(
      (sum, a) => sum + (POINT_BUY_COSTS[abilityValues[a.id] ?? 8] ?? 0), 0,
    );
  }, [abilities, abilityValues]);

  const pointsRemaining = POINT_BUY_TOTAL - pointsSpent;

  return (
    <Stack direction="row" spacing={2} useFlexGap sx={{
      flexWrap: "wrap"
    }}>
      {abilities.map((ability) => {
        const score = abilityValues?.[ability.id] ?? 8;
        const costNow = POINT_BUY_COSTS[score] ?? 0;
        const costNext = POINT_BUY_COSTS[score + 1];
        const canIncrease = score < 18 && costNext !== undefined && (costNext - costNow) <= pointsRemaining;
        const canDecrease = score > 8;

        return (
          <AbilityCard
            key={ability.id}
            name={ability.name}
            score={score}
            onIncrease={() => setValue(`abilities.${ability.id}`, score + 1)}
            onDecrease={() => setValue(`abilities.${ability.id}`, score - 1)}
            canIncrease={canIncrease}
            canDecrease={canDecrease}
            bottomInfo={`Cost: ${costNow}`}
          />
        );
      })}
    </Stack>
  );
}

interface AbilityScoresHandle {
  rollAll: () => void;
}

function AbilityScoresSection({
  ref,
  abilities,
  control,
  setValue,
  onRollingChange,
  method,
}: {
  ref: Ref<AbilityScoresHandle>;
  abilities: { id: string; name: string }[];
  control: Control<CreateCharacterFormData>;
  setValue: (key: `abilities.${string}`, value: number) => void;
  onRollingChange: (rolling: boolean) => void;
  method: RollMethodId;
}) {
  const abilityValues = useWatch({ control, name: "abilities" });
  const [rolling, setRolling] = useState(false);
  const [rollingValues, setRollingValues] = useState<Record<string, number>>({});
  const [settledIds, setSettledIds] = useState<Set<string>>(new Set());
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      for (const id of intervalsRef.current) { clearInterval(id); }
      for (const id of timeoutsRef.current) { clearTimeout(id); }
    };
  }, []);

  const handleRollAll = () => {
    const rollFn = getRollFunction(method);
    if (rolling || !rollFn) return;

    for (const id of intervalsRef.current) { clearInterval(id); }
    for (const id of timeoutsRef.current) { clearTimeout(id); }
    intervalsRef.current = [];
    timeoutsRef.current = [];

    setRolling(true);
    onRollingChange(true);
    setSettledIds(new Set());

    for (const ability of abilities) {
      const interval = setInterval(() => {
        setRollingValues((prev) => ({
          ...prev,
          [ability.id]: Math.floor(Math.random() * 16) + 3,
        }));
      }, 50);
      intervalsRef.current.push(interval);
    }

    for (const [index, ability] of abilities.entries()) {
      const delay = 800 + index * 150;
      const timeout = setTimeout(() => {
        clearInterval(intervalsRef.current[index]);

        const result = rollFn();
        setRollingValues((prev) => ({ ...prev, [ability.id]: result }));
        setValue(`abilities.${ability.id}`, result);
        setSettledIds((prev) => new Set(prev).add(ability.id));

        if (index === abilities.length - 1) {
          const doneTimeout = setTimeout(() => {
            setRolling(false);
            onRollingChange(false);
            setSettledIds(new Set());
          }, 400);
          timeoutsRef.current.push(doneTimeout);
        }
      }, delay);
      timeoutsRef.current.push(timeout);
    }
  };

  useImperativeHandle(ref, () => ({ rollAll: handleRollAll }));

  if (method === "standard-array") {
    return <StandardArrayScores abilities={abilities} abilityValues={abilityValues} setValue={setValue} />;
  }

  if (method === "point-buy") {
    return <PointBuyScores abilities={abilities} abilityValues={abilityValues} setValue={setValue} />;
  }

  return (
    <Stack direction="row" spacing={2} useFlexGap sx={{
      flexWrap: "wrap"
    }}>
      {abilities.map((ability) => {
        const isSettled = settledIds.has(ability.id);
        const displayValue = rolling
          ? (rollingValues[ability.id] ?? abilityValues?.[ability.id] ?? 10)
          : (abilityValues?.[ability.id] ?? 10);

        return (
          <AbilityCard
            key={ability.id}
            name={ability.name}
            score={displayValue}
            onIncrease={() => setValue(`abilities.${ability.id}`, Math.min(100, displayValue + 1))}
            onDecrease={() => setValue(`abilities.${ability.id}`, Math.max(1, displayValue - 1))}
            canIncrease={!rolling && displayValue < 100}
            canDecrease={!rolling && displayValue > 1}
            bottomInfo={`Mod: ${formatModifier(displayValue)}`}
            isSettled={isSettled}
          />
        );
      })}
    </Stack>
  );
}

export function CreateCharacterDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const abilityScoresRef = useRef<AbilityScoresHandle>(null);
  const [abilityRolling, setAbilityRolling] = useState(false);
  const [rollMethod, setRollMethod] = useState<RollMethodId>("4d6-drop-lowest");
  const form = useForm<CreateCharacterFormData>({
    defaultValues: {
      rulesetId: "",
      raceId: "",
      name: "",
      xp: 0,
      abilities: {} as Record<string, number>,
      age: 1,
      height: "",
      weight: "",
      deity: "",
      description: "",
      notes: "",
    },
  });
  const {
    control,
    register,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = form;

  const selectedRulesetId = watch("rulesetId");
  const selectedAlignment = watch("alignment");
  const selectedGender = watch("gender");

  // Fetch rulesets
  const [rulesetSearch, setRulesetSearch] = useState("");
  const debouncedRulesetSearch = useDebouncedValue(rulesetSearch);

  register("rulesetId", { required: "Ruleset is required" });

  const {
    data: rulesetsData,
    fetchNextPage: fetchNextRulesetsPage,
    hasNextPage: hasNextRulesetsPage,
    isFetchingNextPage: isFetchingNextRulesetsPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.rulesets.list({
      scope: "published",
      search: debouncedRulesetSearch,
    }),
    queryFn: async ({ pageParam }) => {
      return parseResponse(rpc.api.rulesets.$get({
        query: {
          limit: "10",
          page: pageParam.toString(),
          scope: "published",
          ...(debouncedRulesetSearch && { search: debouncedRulesetSearch }),
        },
      }));
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });

  const {
    data: campaignRulesetsData,
    fetchNextPage: fetchNextCampaignRulesetsPage,
    hasNextPage: hasNextCampaignRulesetsPage,
    isFetchingNextPage: isFetchingNextCampaignRulesetsPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.rulesets.list({
      scope: "campaignAccessible",
      search: debouncedRulesetSearch,
    }),
    queryFn: async ({ pageParam }) => {
      return parseResponse(rpc.api.rulesets.$get({
        query: {
          limit: "10",
          page: pageParam.toString(),
          scope: "campaignAccessible",
          ...(debouncedRulesetSearch && { search: debouncedRulesetSearch }),
        },
      }));
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });

  const {
    data: myDraftsData,
    fetchNextPage: fetchNextMyDraftsPage,
    hasNextPage: hasNextMyDraftsPage,
    isFetchingNextPage: isFetchingNextMyDraftsPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.rulesets.list({
      scope: "myDrafts",
      search: debouncedRulesetSearch,
    }),
    queryFn: async ({ pageParam }) => {
      return parseResponse(rpc.api.rulesets.$get({
        query: {
          limit: "10",
          page: pageParam.toString(),
          scope: "myDrafts",
          ...(debouncedRulesetSearch && { search: debouncedRulesetSearch }),
        },
      }));
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });

  const rulesets = useMemo(() => {
    const draftRulesets =
      myDraftsData?.pages.flatMap((page) => page.items) ?? [];
    const publishedRulesets =
      rulesetsData?.pages.flatMap((page) => page.items) ?? [];
    const campaignRulesets =
      campaignRulesetsData?.pages.flatMap((page) => page.items) ?? [];
    const seenIds = new Set(draftRulesets.map((r) => r.id));
    const dedupedPublished = publishedRulesets.filter(
      (r) => !seenIds.has(r.id),
    );
    for (const r of dedupedPublished) { seenIds.add(r.id); }
    const dedupedCampaign = campaignRulesets.filter(
      (r) => !seenIds.has(r.id),
    );
    return [
      ...draftRulesets.map((r) => ({ ...r, group: "My Drafts" as const })),
      ...dedupedPublished.map((r) => ({ ...r, group: "Published" as const })),
      ...dedupedCampaign.map((r) => ({ ...r, group: "Campaign" as const })),
    ];
  }, [myDraftsData?.pages, rulesetsData?.pages, campaignRulesetsData?.pages]);

  const [selectedRuleset, setSelectedRuleset] = useState<
    (typeof rulesets)[number] | null
  >(null);

  // Fetch races for selected ruleset, annotated with eligibility
  const {
    data: racesData,
    isPending: isRacesPending,
    isPlaceholderData: isRacesPlaceholder,
    fetchNextPage: fetchNextRacesPage,
    hasNextPage: hasNextRacesPage,
    isFetchingNextPage: isFetchingNextRacesPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.characters.availableRaces(selectedRulesetId!, {
      alignment: selectedAlignment,
      gender: selectedGender,
    }),
    queryFn: async ({ pageParam }) => {
      return parseResponse(rpc.api.characters["available-races"].$get({
        query: {
          rulesetId: selectedRulesetId!,
          ...(selectedAlignment && { alignment: selectedAlignment }),
          ...(selectedGender && { gender: selectedGender }),
          limit: "100",
          page: pageParam.toString(),
        },
      }));
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: !!selectedRulesetId,
    placeholderData: keepPreviousData,
  });

  const races = useMemo(
    () => racesData?.pages.flatMap((page) => page.items) ?? [],
    [racesData?.pages],
  );

  // Clear the race once the list for the current ruleset, alignment and gender
  // has loaded without it, or with it ineligible. While a new list loads, the
  // previous one is still shown, so it can't tell.
  const selectedRaceId = watch("raceId");
  const racesSettled = !!selectedRulesetId && !isRacesPending && !isRacesPlaceholder;
  useEffect(() => {
    if (!selectedRaceId || !racesSettled) return;
    const selectedRace = races.find((r) => r.id === selectedRaceId);
    if (!selectedRace || !selectedRace.eligible) {
      setValue("raceId", "");
    }
  }, [races, racesSettled, selectedRaceId, setValue]);

  const { data: abilityItems } = useRulesetAbilities(selectedRulesetId || undefined);
  const rulesetAbilities = useMemo(() => {
    const items = abilityItems ?? [];
    if (!selectedRuleset?.baseRules) return items;
    return sortAbilities(items, selectedRuleset.baseRules, (a) => a.name);
  }, [abilityItems, selectedRuleset?.baseRules]);

  // Set default ability scores based on roll method
  useEffect(() => {
    if (rulesetAbilities.length > 0) {
      const defaults: Record<string, number> = {};
      if (rollMethod === "point-buy") {
        for (const ability of rulesetAbilities) {
          defaults[ability.id] = 8;
        }
      } else if (rollMethod === "standard-array") {
        for (const [i, ability] of rulesetAbilities.entries()) {
          defaults[ability.id] = STANDARD_ARRAY[i] ?? STANDARD_ARRAY[STANDARD_ARRAY.length - 1];
        }
      } else {
        for (const ability of rulesetAbilities) {
          defaults[ability.id] = 10;
        }
      }
      setValue("abilities", defaults);
    }
  }, [rulesetAbilities, rollMethod, setValue]);

  const handleRulesetsScroll = createListboxScrollHandler([
    { hasNextPage: hasNextMyDraftsPage, isFetchingNextPage: isFetchingNextMyDraftsPage, fetchNextPage: fetchNextMyDraftsPage },
    { hasNextPage: hasNextRulesetsPage, isFetchingNextPage: isFetchingNextRulesetsPage, fetchNextPage: fetchNextRulesetsPage },
    { hasNextPage: hasNextCampaignRulesetsPage, isFetchingNextPage: isFetchingNextCampaignRulesetsPage, fetchNextPage: fetchNextCampaignRulesetsPage },
  ]);
  const handleRacesScroll = createListboxScrollHandler({
    hasNextPage: hasNextRacesPage,
    isFetchingNextPage: isFetchingNextRacesPage,
    fetchNextPage: fetchNextRacesPage,
  });

  const createCharacterMutation = useMutation({
    mutationFn: async (data: CreateCharacterFormData) => {
      return parseResponse(rpc.api.characters.$post({
        json: {
          rulesetId: data.rulesetId,
          raceId: data.raceId,
          name: data.name,
          xp: data.xp,
          alignment: data.alignment,
          abilities: data.abilities,
          age: data.age || undefined,
          gender: data.gender,
          height: data.height || undefined,
          weight: data.weight || undefined,
          deity: data.deity || undefined,
          description: data.description || undefined,
          notes: data.notes || undefined,
        },
      }));
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.characters.lists });
      reset();
      onClose();
      navigate(`/characters/${data.id}`, { state: { openLevelUp: true } });
    },
    onError: (err) => {
      snackbar.error(err, "Failed to create character");
    },
  });

  const onSubmit = (data: CreateCharacterFormData) => {
    createCharacterMutation.mutate(data);
  };

  return (
    <CreateDialog
      open={open}
      onClose={onClose}
      title="Create New Character"
      form={form}
      onSubmit={onSubmit}
      isLoading={createCharacterMutation.isPending}
      maxWidth="md"
    >
      <AnimatedAlert in={selectedRuleset !== null && !selectedRuleset.userId} severity="warning" sx={{ mb: 2 }}>
        Base rulesets are read-only templates. Fork it first to customize rules for your group.
      </AnimatedAlert>
      {/* Basic Info */}
      <Typography variant="h6">Basic Information</Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField
          {...register("name", { required: "Name is required" })}
          label="Character Name"
          error={!!errors.name}
          helperText={errors.name?.message}
          fullWidth
        />
        <TextField
          {...register("xp", { valueAsNumber: true, min: 0 })}
          label="Experience Points"
          type="number"
          fullWidth
        />
      </Stack>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <Autocomplete
          options={rulesets}
          getOptionLabel={(option) => option.name}
          groupBy={(option) => option.group}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          value={selectedRuleset}
          onChange={(_, newValue) => {
            setSelectedRuleset(newValue);
            setValue("rulesetId", newValue?.id ?? "");
            if (!newValue) setValue("raceId", "");
          }}
          onInputChange={(_, value, reason) => {
            if (reason === "input") setRulesetSearch(value);
          }}
          filterOptions={(x) => x}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Ruleset"
              error={!!errors.rulesetId}
              helperText={errors.rulesetId?.message}
            />
          )}
          fullWidth
          slotProps={{
            listbox: {
              onScroll: handleRulesetsScroll,
              style: { maxHeight: 300 },
            }
          }}
        />

        <FormControl
          fullWidth
          error={!!errors.raceId}
          disabled={!selectedRulesetId}
        >
          <InputLabel>Race</InputLabel>
          <Select
            {...register("raceId", { required: "Race is required" })}
            label="Race"
            // Controlled: the race is cleared when it stops being available.
            value={races.some((race) => race.id === selectedRaceId) ? selectedRaceId : ""}
            MenuProps={{
              slotProps: {
                paper: {
                  style: { maxHeight: 300 },
                  onScroll: handleRacesScroll,
                },
              },
            }}
          >
            {races.map((race) => (
              <MenuItem key={race.id} value={race.id} disabled={!race.eligible}>
                {race.name}
              </MenuItem>
            ))}
          </Select>
          {errors.raceId && <FormHelperText>{errors.raceId.message}</FormHelperText>}
        </FormControl>
      </Stack>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <FormControl fullWidth error={!!errors.alignment}>
          <InputLabel>Alignment</InputLabel>
          <Select
            {...register("alignment", { required: "Alignment is required" })}
            label="Alignment"
            value={selectedAlignment ?? ""}
          >
            {ALIGNMENT_OPTIONS.map((alignment) => (
              <MenuItem key={alignment} value={alignment}>{alignment}</MenuItem>
            ))}
          </Select>
          {errors.alignment && <FormHelperText>{errors.alignment.message}</FormHelperText>}
        </FormControl>

        <FormControl fullWidth error={!!errors.gender}>
          <InputLabel>Gender</InputLabel>
          <Select
            {...register("gender", { required: "Gender is required" })}
            label="Gender"
            value={selectedGender ?? ""}
          >
            {GENDER_OPTIONS.map((gender) => (
              <MenuItem key={gender} value={gender}>{gender}</MenuItem>
            ))}
          </Select>
          {errors.gender && <FormHelperText>{errors.gender.message}</FormHelperText>}
        </FormControl>
      </Stack>

      {/* Ability Scores */}
      <Typography variant="h6">Ability Scores</Typography>
      <Stack direction="row" spacing={1} sx={{
        alignItems: "center"
      }}>
        <TextField
          select
          label="Method"
          value={rollMethod}
          onChange={(e) => setRollMethod(e.target.value as RollMethodId)}
          size="small"
          sx={{ minWidth: 200 }}
        >
          {ROLL_METHODS.map((m) => (
            <MenuItem key={m.id} value={m.id}>{m.label}</MenuItem>
          ))}
        </TextField>
        {isDiceMethod(rollMethod) && (
          <IconButton
            onClick={() => abilityScoresRef.current?.rollAll()}
            disabled={!rulesetAbilities.length || abilityRolling}
            color="primary"
            size="small"
            aria-label="Roll all ability scores"
          >
            <CasinoIcon />
          </IconButton>
        )}
        {rollMethod === "point-buy" && (() => {
          const abilities = watch("abilities");
          const spent = rulesetAbilities.reduce(
            (sum, a) => sum + (POINT_BUY_COSTS[abilities?.[a.id] ?? 8] ?? 0), 0,
          );
          const remaining = POINT_BUY_TOTAL - spent;
          return (
            <Chip
              label={`${remaining} / ${POINT_BUY_TOTAL} pts`}
              color={remaining < 0 ? "error" : remaining === 0 ? "success" : "default"}
              size="small"
            />
          );
        })()}
      </Stack>
      {rulesetAbilities.length > 0 ? (
        <AbilityScoresSection
          ref={abilityScoresRef}
          abilities={rulesetAbilities}
          control={control}
          setValue={setValue}
          onRollingChange={setAbilityRolling}
          method={rollMethod}
        />
      ) : (
        <Stack direction="row" spacing={2} useFlexGap sx={{
          flexWrap: "wrap"
        }}>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton
              key={i}
              variant="rounded"
              height={100}
              sx={{ minWidth: 100, flex: "1 1 0" }}
            />
          ))}
        </Stack>
      )}

      {/* Physical Details */}
      <Typography variant="h6">Physical Details</Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField
          {...register("age", { valueAsNumber: true, min: 1 })}
          label="Age"
          type="number"
          slotProps={{ htmlInput: { min: 1 } }}
          fullWidth
        />
        <TextField
          {...register("height")}
          label="Height"
          placeholder="e.g., 5 feet 8 inches"
          fullWidth
        />
        <TextField
          {...register("weight")}
          label="Weight"
          placeholder="e.g., 150 lbs, 68kg"
          fullWidth
        />
      </Stack>

      {/* Optional Details */}
      <Typography variant="h6">Optional Details</Typography>
      <TextField {...register("deity")} label="Deity" fullWidth />
      <TextField
        {...register("description")}
        label="Description"
        multiline
        minRows={3}
        placeholder="Character appearance, personality, or background..."
        fullWidth
        sx={{ "& textarea": { resize: "vertical" } }}
      />
      <TextField
        {...register("notes")}
        label="Notes"
        multiline
        minRows={3}
        placeholder="Campaign notes, character development, reminders..."
        fullWidth
        sx={{ "& textarea": { resize: "vertical" } }}
      />
    </CreateDialog>
  );
}
