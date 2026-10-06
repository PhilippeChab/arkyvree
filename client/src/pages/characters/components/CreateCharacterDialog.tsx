import { IconButton, MenuItem, Paper, Skeleton, Stack, TextField, Typography } from "@mui/material";
import { keepPreviousData, skipToken, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";
import { type Ref, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { type Control, Controller, useController } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import {
  BaseRulesetAlert,
  CreateDialog,
  DescriptionField,
  FieldRow,
  FormTextField,
  NameField,
  RulesetPicker,
  SelectField,
  TagChip,
} from "@/client/src/components/common/index.ts";
import { AddIcon, DecrementIcon, DiceIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import {
  type RulesetAbility,
  useDebouncedValue,
  useFormWith,
  useListboxQuery,
  useRulesetAbilities,
} from "@/client/src/hooks/index.ts";
import { sortAbilities } from "@/client/src/lib/abilityOrder.ts";
import { ANIMATIONS } from "@/client/src/lib/animations.ts";
import {
  getRollFunction,
  isDiceMethod,
  POINT_BUY_COSTS,
  POINT_BUY_TOTAL,
  ROLL_METHODS,
  type RollMethodId,
  STANDARD_ARRAY,
} from "@/client/src/lib/dice.ts";
import { formatSigned } from "@/client/src/lib/formatNumeric.ts";
import { createListboxScrollHandler } from "@/client/src/lib/listboxScroll.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import { rulesetPickerQuery } from "@/client/src/lib/queries.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { nameRules, wholeNumberRules } from "@/client/src/lib/validation.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { computeAbilityModifier } from "@/shared/dnd3.5/abilities.ts";
import { ALIGNMENT_OPTIONS, GENDER_OPTIONS } from "@/shared/enums.ts";

interface AbilityCardProps {
  name: string;
  score: number;
  onIncrease: () => void;
  onDecrease: () => void;
  canIncrease: boolean;
  canDecrease: boolean;
  bottomInfo: string;
  isSettled?: boolean;
}

type AbilityOption = Pick<RulesetAbility, "id" | "name">;

interface AbilityScoresHandle {
  rollAll: () => void;
}

interface AbilityScoresSectionProps {
  ref: Ref<AbilityScoresHandle>;
  abilities: AbilityOption[];
  control: Control<CreateCharacterFormData>;
  onRollingChange: (rolling: boolean) => void;
  method: RollMethodId;
}

interface CreateCharacterDialogProps {
  open: boolean;
  onClose: () => void;
}

/** What the character is created with, its alignment and gender unpicked ("") until they're chosen. */
type CreateCharacterFormData = Omit<CreateCharacterRequest, "alignment" | "gender"> & {
  alignment: CreateCharacterRequest["alignment"] | "";
  gender: CreateCharacterRequest["gender"] | "";
};

type CreateCharacterRequest = InferRequestType<typeof rpc.api.characters.$post>["json"];

interface PointBuyScoresProps {
  abilities: AbilityOption[];
  abilityValues: Record<string, number> | undefined;
  onChange: (scores: Record<string, number>) => void;
}

interface StandardArrayScoresProps {
  abilities: AbilityOption[];
  abilityValues: Record<string, number> | undefined;
  onChange: (scores: Record<string, number>) => void;
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
}: AbilityCardProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        minWidth: 100,
        flex: "1 1 0",
        ...(isSettled && {
          animation: ANIMATIONS.settledPulse,
        }),
      }}
    >
      <Stack
        sx={{
          height: "100%",
          minHeight: 100,
          p: 1.5,
          textAlign: "center",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {name}
        </Typography>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", justifyContent: "center" }}>
          <IconButton size="small" aria-label={`Lower ${name}`} onClick={onDecrease} disabled={!canDecrease}>
            <DecrementIcon fontSize="small" />
          </IconButton>
          <Typography component="p" variant="h6" sx={{ minWidth: 28 }}>
            {score}
          </Typography>
          <IconButton size="small" aria-label={`Raise ${name}`} onClick={onIncrease} disabled={!canIncrease}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Stack>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {bottomInfo}
        </Typography>
      </Stack>
    </Paper>
  );
}

function AbilityScoresSection({ ref, abilities, control, onRollingChange, method }: AbilityScoresSectionProps) {
  const {
    field: { value, onChange },
  } = useController({ control, name: "abilities" });
  const abilityValues = scoresOf(abilities, value, method);
  const [rolling, setRolling] = useState(false);
  const [rollingValues, setRollingValues] = useState<Record<string, number>>({});
  const [settledIds, setSettledIds] = useState<Set<string>>(new Set());
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      for (const id of intervalsRef.current) {
        clearInterval(id);
      }
      for (const id of timeoutsRef.current) {
        clearTimeout(id);
      }
    };
  }, []);

  const handleRollAll = () => {
    const rollFn = getRollFunction(method);
    if (rolling || !rollFn) return;

    for (const id of intervalsRef.current) {
      clearInterval(id);
    }
    for (const id of timeoutsRef.current) {
      clearTimeout(id);
    }
    intervalsRef.current = [];
    timeoutsRef.current = [];

    setRolling(true);
    onRollingChange(true);
    setSettledIds(new Set());
    // Each score settles on its own timer: the roll keeps the scores so far, written at each
    const rolled = { ...abilityValues };

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
        rolled[ability.id] = result;
        onChange({ ...rolled });
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
    return <StandardArrayScores abilities={abilities} abilityValues={abilityValues} onChange={onChange} />;
  }

  if (method === "point-buy") {
    return <PointBuyScores abilities={abilities} abilityValues={abilityValues} onChange={onChange} />;
  }

  return (
    <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
      {abilities.map((ability) => {
        const isSettled = settledIds.has(ability.id);
        const displayValue = rolling
          ? (rollingValues[ability.id] ?? abilityValues[ability.id])
          : abilityValues[ability.id];

        return (
          <AbilityCard
            key={ability.id}
            name={ability.name}
            score={displayValue}
            onIncrease={() => onChange({ ...abilityValues, [ability.id]: Math.min(100, displayValue + 1) })}
            onDecrease={() => onChange({ ...abilityValues, [ability.id]: Math.max(1, displayValue - 1) })}
            canIncrease={!rolling && displayValue < 100}
            canDecrease={!rolling && displayValue > 1}
            bottomInfo={`Mod: ${formatSigned(computeAbilityModifier(displayValue))}`}
            isSettled={isSettled}
          />
        );
      })}
    </Stack>
  );
}

/** An ability's score before one is set: 8 to point-buy from, the standard array's in order, else 10. */
function defaultScore(method: RollMethodId, index: number) {
  if (method === "point-buy") return 8;
  if (method === "standard-array") return STANDARD_ARRAY[index] ?? STANDARD_ARRAY[STANDARD_ARRAY.length - 1];
  return 10;
}

function PointBuyScores({ abilities, abilityValues, onChange }: PointBuyScoresProps) {
  const pointsSpent = useMemo(() => {
    if (!abilityValues) return 0;
    return abilities.reduce((sum, a) => sum + (POINT_BUY_COSTS[abilityValues[a.id] ?? 8] ?? 0), 0);
  }, [abilities, abilityValues]);

  const pointsRemaining = POINT_BUY_TOTAL - pointsSpent;

  return (
    <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
      {abilities.map((ability) => {
        const score = abilityValues?.[ability.id] ?? 8;
        const costNow = POINT_BUY_COSTS[score] ?? 0;
        const costNext = POINT_BUY_COSTS[score + 1];
        const canIncrease = score < 18 && costNext !== undefined && costNext - costNow <= pointsRemaining;
        const canDecrease = score > 8;

        return (
          <AbilityCard
            key={ability.id}
            name={ability.name}
            score={score}
            onIncrease={() => onChange({ ...abilityValues, [ability.id]: score + 1 })}
            onDecrease={() => onChange({ ...abilityValues, [ability.id]: score - 1 })}
            canIncrease={canIncrease}
            canDecrease={canDecrease}
            bottomInfo={`Cost: ${costNow}`}
          />
        );
      })}
    </Stack>
  );
}

/** Every ability's score: the one set, or its method's default. */
function scoresOf(abilities: AbilityOption[], values: Record<string, number> | undefined, method: RollMethodId) {
  return Object.fromEntries(
    abilities.map((ability, index) => [ability.id, values?.[ability.id] ?? defaultScore(method, index)]),
  );
}

function StandardArrayScores({ abilities, abilityValues, onChange }: StandardArrayScoresProps) {
  // A score already given to another ability swaps with this one's
  const handleChange = (abilityId: string, newValue: number) => {
    if (!abilityValues) return;
    const next = { ...abilityValues };
    const swapId = abilities.find((a) => a.id !== abilityId && abilityValues[a.id] === newValue)?.id;
    if (swapId) next[swapId] = abilityValues[abilityId] ?? STANDARD_ARRAY[STANDARD_ARRAY.length - 1];
    next[abilityId] = newValue;
    onChange(next);
  };

  const sortedAsc = useMemo(() => [...STANDARD_ARRAY].sort((a, b) => a - b), []);

  return (
    <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
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
            bottomInfo={`Mod: ${formatSigned(computeAbilityModifier(score))}`}
          />
        );
      })}
    </Stack>
  );
}

export function CreateCharacterDialog({ open, onClose }: CreateCharacterDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const abilityScoresRef = useRef<AbilityScoresHandle>(null);
  const [abilityRolling, setAbilityRolling] = useState(false);
  const [rollMethod, setRollMethod] = useState<RollMethodId>("4d6-drop-lowest");
  const form = useFormWith<CreateCharacterFormData>({
    rulesetId: "",
    raceId: "",
    name: "",
    xp: 0,
    alignment: "",
    gender: "",
    abilities: {},
    age: 1,
    height: "",
    weight: "",
    deity: "",
    description: "",
    notes: "",
  });
  const { control, reset, watch, setValue } = form;

  const selectedRulesetId = watch("rulesetId");
  const selectedAlignment = watch("alignment");
  const selectedGender = watch("gender");

  const [rulesetSearch, setRulesetSearch] = useState("");
  const debouncedRulesetSearch = useDebouncedValue(rulesetSearch);

  const {
    data: rulesetsData,
    isLoading: isRulesetsLoading,
    fetchNextPage: fetchNextRulesetsPage,
    hasNextPage: hasNextRulesetsPage,
    isFetchingNextPage: isFetchingNextRulesetsPage,
  } = useInfiniteQuery({
    ...rulesetPickerQuery("published", debouncedRulesetSearch),
    enabled: open,
  });

  const {
    data: campaignRulesetsData,
    isLoading: isCampaignRulesetsLoading,
    fetchNextPage: fetchNextCampaignRulesetsPage,
    hasNextPage: hasNextCampaignRulesetsPage,
    isFetchingNextPage: isFetchingNextCampaignRulesetsPage,
  } = useInfiniteQuery({
    ...rulesetPickerQuery("campaignAccessible", debouncedRulesetSearch),
    enabled: open,
  });

  const {
    data: myDraftsData,
    isLoading: isMyDraftsLoading,
    fetchNextPage: fetchNextMyDraftsPage,
    hasNextPage: hasNextMyDraftsPage,
    isFetchingNextPage: isFetchingNextMyDraftsPage,
  } = useInfiniteQuery({
    ...rulesetPickerQuery("myDrafts", debouncedRulesetSearch),
    enabled: open,
  });

  const rulesets = useMemo(() => {
    const draftRulesets = pageItems(myDraftsData);
    const publishedRulesets = pageItems(rulesetsData);
    const campaignRulesets = pageItems(campaignRulesetsData);
    const seenIds = new Set(draftRulesets.map((r) => r.id));
    const dedupedPublished = publishedRulesets.filter((r) => !seenIds.has(r.id));
    for (const r of dedupedPublished) {
      seenIds.add(r.id);
    }
    const dedupedCampaign = campaignRulesets.filter((r) => !seenIds.has(r.id));
    return [
      ...draftRulesets.map((r) => ({ ...r, group: "My Drafts" as const })),
      ...dedupedPublished.map((r) => ({ ...r, group: "Published" as const })),
      ...dedupedCampaign.map((r) => ({ ...r, group: "Campaign" as const })),
    ];
  }, [myDraftsData, rulesetsData, campaignRulesetsData]);

  const [selectedRuleset, setSelectedRuleset] = useState<(typeof rulesets)[number] | null>(null);

  // Fetch races for selected ruleset, annotated with eligibility
  const {
    items: races,
    isPending: isRacesPending,
    isPlaceholderData: isRacesPlaceholder,
    isError: isRacesError,
    onScroll: handleRacesScroll,
  } = useListboxQuery({
    queryKey: queryKeys.characters.availableRaces(selectedRulesetId ?? "", {
      alignment: selectedAlignment,
      gender: selectedGender,
    }),
    queryFn: selectedRulesetId
      ? async ({ pageParam }) => {
          return parseResponse(
            rpc.api.characters["available-races"].$get({
              query: {
                rulesetId: selectedRulesetId,
                alignment: selectedAlignment || undefined,
                gender: selectedGender || undefined,
                limit: "100",
                page: pageParam.toString(),
              },
            }),
          );
        }
      : skipToken,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    placeholderData: keepPreviousData,
  });

  // A race the list for the current ruleset, alignment and gender doesn't offer, once it has loaded, is refused, and
  // the field says why. While a new list loads, the previous one is still shown, and a failed load says nothing.
  const selectedRaceId = watch("raceId");
  const racesSettled = !!selectedRulesetId && !isRacesPending && !isRacesPlaceholder && !isRacesError;
  const raceIssue = (raceId: string) => {
    if (!raceId || !racesSettled) return undefined;
    const race = races.find((r) => r.id === raceId);
    if (!race) return "Not in this ruleset: pick another";
    return race.eligible ? undefined : "Not open to this alignment or gender: pick another";
  };

  const { data: abilityItems } = useRulesetAbilities(selectedRulesetId || undefined);
  const baseRules = selectedRuleset?.baseRules;
  const rulesetAbilities = useMemo(() => {
    const items = abilityItems ?? [];
    if (!baseRules) return items;
    return sortAbilities(items, baseRules, (a) => a.name);
  }, [abilityItems, baseRules]);

  const handleRulesetsScroll = createListboxScrollHandler([
    {
      hasNextPage: hasNextMyDraftsPage,
      isFetchingNextPage: isFetchingNextMyDraftsPage,
      fetchNextPage: fetchNextMyDraftsPage,
    },
    {
      hasNextPage: hasNextRulesetsPage,
      isFetchingNextPage: isFetchingNextRulesetsPage,
      fetchNextPage: fetchNextRulesetsPage,
    },
    {
      hasNextPage: hasNextCampaignRulesetsPage,
      isFetchingNextPage: isFetchingNextCampaignRulesetsPage,
      fetchNextPage: fetchNextCampaignRulesetsPage,
    },
  ]);

  const createCharacterMutation = useMutation({
    mutationFn: async (data: CreateCharacterRequest) => {
      return parseResponse(
        rpc.api.characters.$post({
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
        }),
      );
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

  // The alignment and gender are required: a submit always has them. The scores not set yet are their method's defaults
  const onSubmit = ({ alignment, gender, ...data }: CreateCharacterFormData) => {
    if (!alignment || !gender) return;
    const abilities = scoresOf(rulesetAbilities, data.abilities, rollMethod);
    createCharacterMutation.mutate({ ...data, alignment, gender, abilities });
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
      <BaseRulesetAlert ruleset={selectedRuleset} />
      {/* Basic Info */}
      <Typography component="h3" variant="h6">
        Basic Information
      </Typography>
      <FieldRow>
        <NameField control={control} name="name" rules={nameRules} label="Character Name" />
        <FormTextField
          control={control}
          name="xp"
          rules={wholeNumberRules(0, "Experience points are required")}
          number
          label="Experience Points"
          type="number"
        />
      </FieldRow>

      <FieldRow>
        <Controller
          name="rulesetId"
          control={control}
          rules={{ required: "Ruleset is required" }}
          render={({ field, fieldState }) => (
            <RulesetPicker
              rulesets={rulesets}
              value={selectedRuleset}
              // Another ruleset's abilities start from their defaults
              onChange={(ruleset) => {
                setSelectedRuleset(ruleset);
                field.onChange(ruleset?.id ?? "");
                setValue("abilities", {});
                if (!ruleset) setValue("raceId", "");
              }}
              onSearch={setRulesetSearch}
              onScroll={handleRulesetsScroll}
              loading={isRulesetsLoading || isCampaignRulesetsLoading || isMyDraftsLoading}
              error={fieldState.error}
              inputRef={field.ref}
            />
          )}
        />

        <SelectField
          control={control}
          name="raceId"
          label="Race"
          rules={{
            required: "Race is required",
            validate: (raceId) => (typeof raceId === "string" && raceIssue(raceId)) || true,
          }}
          helperText={raceIssue(selectedRaceId)}
          options={races.map((race) => ({ value: race.id, label: race.name, disabled: !race.eligible }))}
          disabled={!selectedRulesetId}
          onMenuScroll={handleRacesScroll}
        />
      </FieldRow>

      <FieldRow>
        <SelectField
          control={control}
          name="alignment"
          label="Alignment"
          rules={{ required: "Alignment is required" }}
          options={ALIGNMENT_OPTIONS}
        />
        <SelectField
          control={control}
          name="gender"
          label="Gender"
          rules={{ required: "Gender is required" }}
          options={GENDER_OPTIONS}
        />
      </FieldRow>

      {/* Ability Scores */}
      <Typography component="h3" variant="h6">
        Ability Scores
      </Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <TextField
          select
          label="Method"
          value={rollMethod}
          onChange={(e) => {
            // Another method's scores start from its defaults
            const method = ROLL_METHODS.find((m) => m.id === e.target.value);
            if (!method) return;
            setRollMethod(method.id);
            setValue("abilities", {});
          }}
          sx={{ minWidth: 200 }}
        >
          {ROLL_METHODS.map((m) => (
            <MenuItem key={m.id} value={m.id}>
              {m.label}
            </MenuItem>
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
            <DiceIcon />
          </IconButton>
        )}
        {rollMethod === "point-buy" &&
          (() => {
            const scores = scoresOf(rulesetAbilities, watch("abilities"), rollMethod);
            const spent = rulesetAbilities.reduce((sum, a) => sum + (POINT_BUY_COSTS[scores[a.id]] ?? 0), 0);
            const remaining = POINT_BUY_TOTAL - spent;
            return (
              <TagChip
                tag={{
                  label: `${remaining} / ${POINT_BUY_TOTAL} pts`,
                  color: remaining < 0 ? "error" : remaining === 0 ? "success" : "default",
                }}
              />
            );
          })()}
      </Stack>
      {rulesetAbilities.length > 0 ? (
        <AbilityScoresSection
          ref={abilityScoresRef}
          abilities={rulesetAbilities}
          control={control}
          onRollingChange={setAbilityRolling}
          method={rollMethod}
        />
      ) : (
        <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} variant="rounded" height={100} sx={{ minWidth: 100, flex: "1 1 0" }} />
          ))}
        </Stack>
      )}

      {/* Physical Details */}
      <Typography component="h3" variant="h6">
        Physical Details
      </Typography>
      <FieldRow>
        <FormTextField
          control={control}
          name="age"
          rules={{ min: 1 }}
          number
          label="Age"
          type="number"
          slotProps={{ htmlInput: { min: 1 } }}
        />
        <FormTextField control={control} name="height" label="Height" placeholder="e.g., 5 feet 8 inches" />
        <FormTextField control={control} name="weight" label="Weight" placeholder="e.g., 150 lbs, 68kg" />
      </FieldRow>

      {/* Optional Details */}
      <Typography component="h3" variant="h6">
        Optional Details
      </Typography>
      <FormTextField control={control} name="deity" label="Deity" />
      <DescriptionField
        control={control}
        name="description"
        placeholder="Character appearance, personality, or background..."
      />
      <FormTextField
        control={control}
        name="notes"
        label="Notes"
        multiline
        minRows={3}
        placeholder="Campaign notes, character development, reminders..."
        sx={{ "& textarea": { resize: "vertical" } }}
      />
    </CreateDialog>
  );
}
