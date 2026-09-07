import {
  AnimatedAlert,
  BlankState,
  CreateDialog,
  PageTransition,
  SearchBar,
  type FilterOption,
  type SortOption,
  StyledCard,
  DiceSpinner,
} from "@/client/src/components/common/index.ts";
import { useAttachments, useDebouncedValue, usePageTitle, usePrefetch, useStaggerAnimation } from "@/client/src/hooks/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { sortAbilities } from "@/client/src/lib/abilityOrder.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import {
  Add as AddIcon,
  Archive as ArchiveIcon,
  Casino as CasinoIcon,
  Group as GroupIcon,
  Remove as RemoveIcon,
  Shield as ShieldIcon,
} from "@mui/icons-material";
import {
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Chip,
  Container,
  FormControl,
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
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { type Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { type Control, useForm, useWatch } from "react-hook-form";
import { settledPulse } from "@/client/src/lib/animations.ts";
import { getRollFunction, isDiceMethod, ROLL_METHODS, STANDARD_ARRAY, POINT_BUY_COSTS, POINT_BUY_TOTAL, type RollMethodId } from "@/client/src/lib/dice.ts";
import { useNavigate, useSearchParams } from "react-router-dom";

type CharacterResponse = InferResponseType<typeof rpc.api.characters.$get>;
type CharacterPaginated = Extract<
  Exclude<CharacterResponse, { error: string }>,
  { items: unknown[] }
>;
type Character = CharacterPaginated["items"][number];

type SortField = "name" | "createdAt" | "updatedAt";
type SortDirection = "asc" | "desc";

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

function CreateCharacterModal({
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
      const response = await rpc.api.rulesets.$get({
        query: {
          limit: "10",
          page: pageParam.toString(),
          scope: "published",
          ...(debouncedRulesetSearch && { search: debouncedRulesetSearch }),
        },
      });
      if (!response.ok) throw new Error("Failed to fetch rulesets");
      return response.json();
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
      const response = await rpc.api.rulesets.$get({
        query: {
          limit: "10",
          page: pageParam.toString(),
          scope: "campaignAccessible",
          ...(debouncedRulesetSearch && { search: debouncedRulesetSearch }),
        },
      });
      if (!response.ok) throw new Error("Failed to fetch campaign rulesets");
      return response.json();
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
      const response = await rpc.api.rulesets.$get({
        query: {
          limit: "10",
          page: pageParam.toString(),
          scope: "myDrafts",
          ...(debouncedRulesetSearch && { search: debouncedRulesetSearch }),
        },
      });
      if (!response.ok) throw new Error("Failed to fetch draft rulesets");
      return response.json();
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
    fetchNextPage: fetchNextRacesPage,
    hasNextPage: hasNextRacesPage,
    isFetchingNextPage: isFetchingNextRacesPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.characters.availableRaces(selectedRulesetId!, {
      alignment: selectedAlignment,
      gender: selectedGender,
    }),
    queryFn: async ({ pageParam }) => {
      const response = await rpc.api.characters["available-races"].$get({
        query: {
          rulesetId: selectedRulesetId!,
          ...(selectedAlignment && { alignment: selectedAlignment }),
          ...(selectedGender && { gender: selectedGender }),
          limit: "100",
          page: pageParam.toString(),
        },
      });
      if (!response.ok) throw new Error("Failed to fetch races");
      return response.json();
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

  // Clear race selection if the selected race is no longer available or becomes ineligible
  const selectedRaceId = watch("raceId");
  useEffect(() => {
    if (selectedRaceId && races.length > 0) {
      const selectedRace = races.find((r) => r.id === selectedRaceId);
      if (!selectedRace || !selectedRace.eligible) {
        setValue("raceId", "");
      }
    }
  }, [races, selectedRaceId, setValue]);

  // Fetch abilities for selected ruleset
  const { data: abilitiesData } = useQuery({
    queryKey: queryKeys.rulesets.section(selectedRulesetId, "abilities"),
    queryFn: async () => {
      if (!selectedRulesetId)
        return { items: [], page: 1, nextPage: undefined };
      const response = await rpc.api.rulesets[":id"].abilities.$get({
        param: { id: selectedRulesetId },
        query: { limit: "100", page: "1" },
      });
      if (!response.ok) throw new Error("Failed to fetch abilities");
      return response.json();
    },
    enabled: !!selectedRulesetId,
  });

  const rulesetAbilities = useMemo(() => {
    const items = abilitiesData?.items ?? [];
    if (!selectedRuleset?.baseRules) return items;
    return sortAbilities(items, selectedRuleset.baseRules, (a) => a.name);
  }, [abilitiesData?.items, selectedRuleset?.baseRules]);

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

  const handleRulesetsScroll = (event: React.UIEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const bottom =
      target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
    if (bottom) {
      if (hasNextMyDraftsPage && !isFetchingNextMyDraftsPage)
        fetchNextMyDraftsPage();
      if (hasNextRulesetsPage && !isFetchingNextRulesetsPage)
        fetchNextRulesetsPage();
      if (hasNextCampaignRulesetsPage && !isFetchingNextCampaignRulesetsPage)
        fetchNextCampaignRulesetsPage();
    }
  };

  const handleRacesScroll = (event: React.UIEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const bottom =
      target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
    if (bottom && hasNextRacesPage && !isFetchingNextRacesPage) {
      fetchNextRacesPage();
    }
  };

  const createCharacterMutation = useMutation({
    mutationFn: async (data: CreateCharacterFormData) => {
      const response = await rpc.api.characters.$post({
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
      });
      if (!response.ok) throw new Error("Failed to create character");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.characters.lists });
      reset();
      onClose();
      navigate(`/characters/${(data as { id: string }).id}`, { state: { openLevelUp: true } });
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
          defaultValue={0}
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
            defaultValue=""
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
        </FormControl>
      </Stack>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <FormControl fullWidth error={!!errors.alignment}>
          <InputLabel>Alignment</InputLabel>
          <Select
            {...register("alignment", {
              required: "Alignment is required",
            })}
            label="Alignment"
            defaultValue=""
          >
            <MenuItem value="Lawful Good">Lawful Good</MenuItem>
            <MenuItem value="Neutral Good">Neutral Good</MenuItem>
            <MenuItem value="Chaotic Good">Chaotic Good</MenuItem>
            <MenuItem value="Lawful Neutral">Lawful Neutral</MenuItem>
            <MenuItem value="True Neutral">True Neutral</MenuItem>
            <MenuItem value="Chaotic Neutral">Chaotic Neutral</MenuItem>
            <MenuItem value="Lawful Evil">Lawful Evil</MenuItem>
            <MenuItem value="Neutral Evil">Neutral Evil</MenuItem>
            <MenuItem value="Chaotic Evil">Chaotic Evil</MenuItem>
          </Select>
        </FormControl>

        <FormControl fullWidth error={!!errors.gender}>
          <InputLabel>Gender</InputLabel>
          <Select
            {...register("gender", { required: "Gender is required" })}
            label="Gender"
            defaultValue=""
          >
            <MenuItem value="Male">Male</MenuItem>
            <MenuItem value="Female">Female</MenuItem>
            <MenuItem value="Other">Other</MenuItem>
          </Select>
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

function CharacterCard({
  character,
  isArchived,
  animationIndex,
  animationOffset,
  portraitUrl,
}: {
  character: Character;
  isArchived: boolean;
  animationIndex: number;
  animationOffset: number;
  portraitUrl: string | null;
}) {
  const navigate = useNavigate();
  const queryKey = useMemo(
    () => queryKeys.characters.detail(character.id),
    [character.id],
  );
  const queryFn = useCallback(async () => {
    const response = await rpc.api.characters[":id"]["$get"]({
      param: { id: character.id },
    });
    if (!response.ok) throw new Error("Failed to fetch character");
    return response.json();
  }, [character.id]);
  const prefetchHandlers = usePrefetch(queryKey, queryFn);

  return (
    <StyledCard
      isArchived={isArchived}
      animationIndex={animationIndex}
      animationOffset={animationOffset}
      onClick={() => navigate(`/characters/${character.id}`)}
      {...prefetchHandlers}
    >
      <Box sx={{ p: { xs: 2, sm: 3 }, pb: { xs: 1.5, sm: 2 } }}>
        {/* Title and Status */}
        <Stack
          direction="row"
          sx={{
            justifyContent: "space-between",
            alignItems: "flex-start",
            mb: 1.5
          }}>
          <Stack
            direction="row"
            spacing={1.5}
            sx={{
              alignItems: "center",
              minWidth: 0,
              flex: 1
            }}>
            <Avatar
              src={portraitUrl ?? undefined}
              sx={{
                width: 36,
                height: 36,
                border: "2px solid",
                borderColor: "secondary.main",
                background: (theme) =>
                  `linear-gradient(135deg, ${theme.palette.primary.light}, ${theme.palette.primary.main})`,
                fontSize: "1rem",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {character.name.charAt(0).toUpperCase()}
            </Avatar>
            <Typography
              variant="h6"
              noWrap
              sx={{
                fontWeight: 600,
                color: "text.primary",
                lineHeight: 1.3,
                flex: 1,
              }}
            >
              {character.name}
            </Typography>
          </Stack>
        </Stack>

        {/* Race and Class/Level Pills */}
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: "center",
            flexWrap: "wrap",
            gap: 1,
            mb: 2
          }}>
          {character.accessRole === "contributor" && (
            <Chip
              label="Shared"
              size="small"
              color="info"
              variant="outlined"
            />
          )}
          <Chip
            label={character.race}
            size="small"
            variant="outlined"
            sx={{
              borderColor: "secondary.main",
              color: "secondary.main",
              fontWeight: 500,
            }}
          />
          {character.levels.map(
            (level: { klass: string; level: number }, index: number) => (
              <Chip
                key={index}
                label={`${level.klass} ${level.level}`}
                size="small"
                sx={{
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  fontWeight: 500,
                }}
              />
            ),
          )}
        </Stack>
      </Box>
      {/* Description */}
      <Box sx={{ px: { xs: 2, sm: 3 }, pb: { xs: 2, sm: 3 }, flex: 1 }}>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            lineHeight: 1.6,
            minHeight: "6.4em"
          }}>
          {character.description || "No description provided."}
        </Typography>
      </Box>
    </StyledCard>
  );
}

type CharacterFilter = "active" | "shared" | "archived";
const CHARACTER_FILTER_OPTIONS: FilterOption<CharacterFilter>[] = [
  { value: "active", label: "Active" },
  { value: "shared", label: "Shared" },
  { value: "archived", label: "Archived" },
];

const CHARACTER_SORT_OPTIONS: SortOption<SortField>[] = [
  { field: "name", direction: "asc", label: "Name (A-Z)" },
  { field: "name", direction: "desc", label: "Name (Z-A)" },
  { field: "createdAt", direction: "desc", label: "Newest First" },
  { field: "createdAt", direction: "asc", label: "Oldest First" },
  { field: "updatedAt", direction: "desc", label: "Recently Updated" },
  { field: "updatedAt", direction: "asc", label: "Least Recently Updated" },
];

export default function CharactersPage() {
  usePageTitle("Characters");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const { offset, updateOffset } = useStaggerAnimation();
  const limit = 10;

  // Get state from URL params
  const rawView = searchParams.get("view");
  const view: CharacterFilter = rawView === "active" || rawView === "shared" || rawView === "archived" ? rawView : "active";
  const searchQuery = searchParams.get("search") || "";
  const debouncedSearchQuery = useDebouncedValue(searchQuery);
  const rawOrderBy = searchParams.get("orderBy");
  const orderBy: SortField = rawOrderBy === "name" || rawOrderBy === "createdAt" || rawOrderBy === "updatedAt" ? rawOrderBy : "createdAt";
  const rawOrderDir = searchParams.get("orderDir");
  const orderDir: SortDirection = rawOrderDir === "asc" || rawOrderDir === "desc" ? rawOrderDir : "desc";
  const visibilityParam: "active" | "archived" = view === "archived" ? "archived" : "active";
  const accessRoleParam: "contributor" | undefined = view === "shared" ? "contributor" : undefined;

  // Update URL when filters change
  const updateURLParams = (updates: Record<string, string | null>) => {
    const newParams = new URLSearchParams(searchParams);

    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        newParams.set(key, value);
      } else {
        newParams.delete(key);
      }
    }

    setSearchParams(newParams);
  };

  const {
    data,
    isLoading: charactersLoading,
    error: charactersError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.characters.list({
      view,
      search: debouncedSearchQuery,
      orderBy,
      orderDir,
    }),
    queryFn: async ({ pageParam }) => {
      const response = await rpc.api.characters.$get({
        query: {
          page: pageParam.toString(),
          limit: limit.toString(),
          visibility: visibilityParam,
          search: debouncedSearchQuery || undefined,
          orderBy,
          orderDir,
          accessRole: accessRoleParam,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch characters");
      }

      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage as CharacterPaginated).nextPage,
    placeholderData: keepPreviousData,
  });

  // Handler functions
  const handleViewChange = (newView: CharacterFilter | undefined) => {
    updateURLParams({ view: newView || "active" });
  };

  const handleSortChange = (field: SortField, direction: SortDirection) => {
    updateURLParams({ orderBy: field, orderDir: direction });
  };

  const characters = useMemo(
    () => data?.pages.flatMap((page) => (page as CharacterPaginated).items) ?? [],
    [data?.pages],
  );

  const characterIds = useMemo(() => characters.map((c) => c.id), [characters]);
  const { data: portraitsByCharacterId } = useAttachments({
    recordType: "Character",
    name: "portrait",
    recordIds: characterIds,
  });

  if (charactersLoading) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box sx={{ display: "flex", justifyContent: "center" }}>
          <DiceSpinner />
        </Box>
      </Container>
    );
  }

  if (charactersError) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Alert severity="error">Failed to load characters.</Alert>
      </Container>
    );
  }

  return (
    <PageTransition>
      <Container maxWidth="xl" sx={{ py: 4 }}>
        {/* Header Section */}
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, sm: 4 },
            mb: 3,
            background: (theme) =>
              `linear-gradient(135deg, ${theme.palette.primary.main}15, ${theme.palette.primary.dark}15)`,
            borderRadius: 2,
          }}
        >
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{
              justifyContent: "space-between",
              alignItems: { xs: "stretch", sm: "center" }
            }}>
            <Box>
              <Typography
                component="h3"
                gutterBottom
                sx={{ fontWeight: 700, typography: { xs: "h4", md: "h3" } }}
              >
                Characters
              </Typography>
              <Typography
                sx={{
                  typography: { xs: "body1", sm: "h6" },
                  color: "text.secondary",
                }}
              >
                View and manage your character collection
              </Typography>
            </Box>
            <Button
              variant="contained"
              size="large"
              startIcon={<AddIcon />}
              onClick={() => setCreateModalOpen(true)}
              sx={{
                px: 3,
                py: 1.5,
                borderRadius: 2,
                boxShadow: (theme) =>
                  `0 4px 14px 0 ${theme.palette.primary.main}40`,
              }}
            >
              Create Character
            </Button>
          </Stack>
        </Paper>

        <SearchBar
          searchValue={searchQuery}
          onSearchChange={(value) => updateURLParams({ search: value || null })}
          searchPlaceholder="Search characters..."
          filterOptions={CHARACTER_FILTER_OPTIONS}
          filterValue={view}
          onFilterChange={handleViewChange}
          sortOptions={CHARACTER_SORT_OPTIONS}
          sortField={orderBy}
          sortDirection={orderDir}
          onSortChange={handleSortChange}
        />

        {/* Characters Grid */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              md: "repeat(2, 1fr)",
              lg: "repeat(3, 1fr)",
            },
            gap: 3,
            mb: 3,
          }}
        >
          {characters.length > 0 ? (
            characters.map((character, index) => (
              <CharacterCard
                key={character.id}
                character={character}
                isArchived={view === "archived"}
                animationIndex={index}
                animationOffset={offset}
                portraitUrl={portraitsByCharacterId?.get(character.id) ?? null}
              />
            ))
          ) : view === "archived" ? (
            <BlankState
              icon={
                <ArchiveIcon
                  sx={{
                    fontSize: { xs: 56, sm: 80 },
                    color: "text.secondary",
                    mb: 2,
                    opacity: 0.5,
                  }}
                />
              }
              title="No archived characters"
              description="Characters you archive will appear here. You can restore them at any time."
              action={
                <Button
                  variant="outlined"
                  onClick={() => updateURLParams({ view: "active" })}
                  sx={{
                    fontWeight: 600,
                    px: 3,
                    py: 1,
                    borderRadius: 2,
                  }}
                >
                  View Active Characters
                </Button>
              }
              sx={{ gridColumn: "1 / -1" }}
            />
          ) : view === "shared" ? (
            <BlankState
              icon={
                <GroupIcon
                  sx={{
                    fontSize: { xs: 56, sm: 80 },
                    color: "text.secondary",
                    mb: 2,
                    opacity: 0.5,
                  }}
                />
              }
              title="No shared characters"
              description="Characters other users invite you to contribute to will appear here."
              action={
                <Button
                  variant="outlined"
                  onClick={() => updateURLParams({ view: "active" })}
                  sx={{
                    fontWeight: 600,
                    px: 3,
                    py: 1,
                    borderRadius: 2,
                  }}
                >
                  View Active Characters
                </Button>
              }
              sx={{ gridColumn: "1 / -1" }}
            />
          ) : (
            <BlankState
              icon={
                <ShieldIcon
                  sx={{
                    fontSize: { xs: 56, sm: 80 },
                    color: "text.secondary",
                    mb: 2,
                    opacity: 0.5,
                  }}
                />
              }
              title="No characters yet"
              description="Create your first character to start your adventure"
              action={
                <Button
                  variant="contained"
                  size="large"
                  startIcon={<AddIcon />}
                  onClick={() => setCreateModalOpen(true)}
                  sx={{
                    fontWeight: 600,
                    px: 4,
                    py: 1.5,
                    borderRadius: 2,
                  }}
                >
                  Create Your First Character
                </Button>
              }
              sx={{ gridColumn: "1 / -1" }}
            />
          )}
        </Box>

        {hasNextPage && (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
            <Button
              onClick={() => {
                updateOffset(characters.length);
                fetchNextPage();
              }}
              disabled={isFetchingNextPage}
              variant="outlined"
              size="large"
              sx={{
                px: 4,
                py: 1.5,
                borderRadius: 2,
                fontWeight: 600,
                borderWidth: 2,
                "&:hover": {
                  borderWidth: 2,
                },
              }}
            >
              <DiceSpinner size="small" loading={isFetchingNextPage}>Load More Characters</DiceSpinner>
            </Button>
          </Box>
        )}

        <CreateCharacterModal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
        />
      </Container>
    </PageTransition>
  );
}
