import { IconButton, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { keepPreviousData, useMutation, useQueryClient } from "@tanstack/react-query";
import { type InferRequestType, parseResponse } from "hono/client";
import { useMemo, useState } from "react";
import { type Control, Controller, useController } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import {
  computeAbilityModifier,
  NotesField,
  PrivateNotesField,
  sortAbilities,
} from "@/client/src/components/characters/index.ts";
import {
  BlankNote,
  CountChip,
  CreateDialog,
  DescriptionField,
  DiceSpinner,
  FormTextField,
  LoadError,
  NameField,
  SelectField,
  SubsectionTitle,
} from "@/client/src/components/common/index.ts";
import { AddIcon, RemoveIcon } from "@/client/src/components/icons/index.ts";
import {
  BaseRulesetAlert,
  type RulesetOption,
  RulesetPicker,
  useRulesetPickerOptions,
} from "@/client/src/components/rulesets/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { type Ability, useFormWith, useListboxQuery, useRulesetAbilities } from "@/client/src/hooks/index.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { requiredRules, wholeNumberRules } from "@/client/src/lib/validation.ts";
import type { CharacterPageState } from "@/client/src/pages/characters/characterPageState.ts";
import { availableRacesQuery } from "@/client/src/pages/characters/characterQueries.ts";
import {
  getRollFunction,
  POINT_BUY_COSTS,
  POINT_BUY_TOTAL,
  pointBuySpent,
  ROLL_METHODS,
  type RollMethodId,
  STANDARD_ARRAY,
} from "@/client/src/pages/characters/dice.ts";
import { formatPointsSpent } from "@/client/src/pages/characters/pointsSpent.ts";
import { RollAllButton } from "@/client/src/pages/characters/RollAllButton.tsx";
import { type DiceRoll, useDiceRoll } from "@/client/src/pages/characters/useDiceRoll.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { PREFERS_REDUCED_MOTION, settleAnimation } from "@/client/src/theme/animations.ts";
import { MAX_ABILITY_SCORE } from "@/shared/dnd3.5/abilities.ts";
import { ALIGNMENT_OPTIONS, GENDER_OPTIONS } from "@/shared/enums.ts";
import { formatSigned } from "@/shared/text.ts";

interface AbilityCardProps {
  bottomInfo: string;
  canDecrease: boolean;
  canIncrease: boolean;
  isSettled?: boolean;
  name: string;
  onDecrease: () => void;
  onIncrease: () => void;
  score: number;
}

type AbilityOption = Pick<Ability, "id" | "name">;

interface AbilityScoresFieldProps {
  abilities: AbilityOption[];
  control: Control<CreateCharacterFormData>;
  /** The dialog's roll of the scores, which they show as it tumbles. */
  diceRoll: DiceRoll;
  method: RollMethodId;
}

interface CreateCharacterDialogProps {
  onClose: () => void;
  /** It has faded out: its opener lets it go, so the next opening starts clean. */
  onExited: () => void;
  open: boolean;
}

/** What the character is created with, its alignment and gender unpicked ("") until they're chosen. */
type CreateCharacterFormData = Omit<CreateCharacterRequest, "alignment" | "gender"> & {
  alignment: CreateCharacterRequest["alignment"] | "";
  gender: CreateCharacterRequest["gender"] | "";
};

type CreateCharacterRequest = InferRequestType<typeof rpc.api.characters.$post>["json"];

/** The scores a method that sets them shows (a point-buy, the standard array), and their change. */
interface SetScoresProps {
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
    <Stack
      component={Paper}
      variant="outlined"
      sx={{
        p: 1.5,
        minWidth: 100,
        flex: "1 1 0",
        textAlign: "center",
        alignItems: "center",
        justifyContent: "space-between",
        minHeight: 100,
        animation: isSettled ? settleAnimation : undefined,
        [PREFERS_REDUCED_MOTION]: { animation: "none" },
      }}
    >
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {name}
      </Typography>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", justifyContent: "center" }}>
        <IconButton size="small" aria-label={`Lower ${name}`} onClick={onDecrease} disabled={!canDecrease}>
          <RemoveIcon fontSize="small" />
        </IconButton>
        <Typography variant="h6" component="p" sx={{ minWidth: 28 }}>
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
  );
}

/** The new character's ability scores, its form's `abilities`, set the way its roll method sets them. */
function AbilityScoresField({ abilities, control, diceRoll, method }: AbilityScoresFieldProps) {
  const {
    field: { value, onChange },
  } = useController({ control, name: "abilities" });
  const abilityValues = scoresOf(abilities, value, method);

  if (method === "standard-array")
    return <StandardArrayScores abilities={abilities} abilityValues={abilityValues} onChange={onChange} />;

  if (method === "point-buy")
    return <PointBuyScores abilities={abilities} abilityValues={abilityValues} onChange={onChange} />;

  return (
    <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
      {abilities.map((ability) => {
        // A score rolling shows its die's faces until it lands
        const score = diceRoll.faceOf(ability.id) ?? abilityValues[ability.id];
        return (
          <AbilityCard
            key={ability.id}
            name={ability.name}
            score={score}
            onIncrease={() => onChange({ ...abilityValues, [ability.id]: Math.min(MAX_ABILITY_SCORE, score + 1) })}
            onDecrease={() => onChange({ ...abilityValues, [ability.id]: Math.max(1, score - 1) })}
            canIncrease={!diceRoll.rolling && score < MAX_ABILITY_SCORE}
            canDecrease={!diceRoll.rolling && score > 1}
            bottomInfo={`Mod: ${formatSigned(computeAbilityModifier(score))}`}
            isSettled={diceRoll.hasLanded(ability.id)}
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

function PointBuyScores({ abilities, abilityValues, onChange }: SetScoresProps) {
  const pointsRemaining = POINT_BUY_TOTAL - pointBuySpent(abilities.map((a) => abilityValues?.[a.id] ?? 8));

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

function StandardArrayScores({ abilities, abilityValues, onChange }: SetScoresProps) {
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

/**
 * A new character: its ruleset, race and details, and its ability scores by the roll method picked. Mounted while it's
 * open, its form, its pickers and its roll method start clean at each opening.
 */
export function CreateCharacterDialog({ open, onClose, onExited }: CreateCharacterDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const diceRoll = useDiceRoll();
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
    privateNotes: "",
  });
  const { control, getValues, watch, setValue } = form;

  const selectedRulesetId = watch("rulesetId");
  const selectedAlignment = watch("alignment");
  const selectedGender = watch("gender");

  const rulesetOptions = useRulesetPickerOptions("character", open);
  const [selectedRuleset, setSelectedRuleset] = useState<RulesetOption | null>(null);

  // Fetch races for selected ruleset, annotated with eligibility
  const {
    items: races,
    isPending: isRacesPending,
    isPlaceholderData: isRacesPlaceholder,
    error: racesError,
    onScroll: handleRacesScroll,
  } = useListboxQuery({
    ...availableRacesQuery(selectedRulesetId, selectedAlignment, selectedGender),
    placeholderData: keepPreviousData,
  });

  // A race the list for the current ruleset, alignment and gender doesn't offer, once it has loaded, is refused, and
  // the field says why. While a new list loads, the previous one is still shown, and a failed load says nothing.
  const selectedRaceId = watch("raceId");
  const racesSettled = !!selectedRulesetId && !isRacesPending && !isRacesPlaceholder && !racesError;
  const raceIssue = (raceId: string) => {
    if (!raceId || !racesSettled) return undefined;
    const race = races.find((r) => r.id === raceId);
    if (!race) return "Not in this ruleset: pick another";
    return race.eligible ? undefined : "Not open to this alignment or gender: pick another";
  };

  const {
    data: abilityItems,
    error: abilitiesError,
    isLoading: abilitiesLoading,
  } = useRulesetAbilities(selectedRulesetId || undefined);
  const baseRules = selectedRuleset?.baseRules;
  const rulesetAbilities = useMemo(() => {
    const items = abilityItems ?? [];
    if (!baseRules) return items;
    return sortAbilities(items, baseRules, (a) => a.name);
  }, [abilityItems, baseRules]);

  // What a point-buy's scores cost, its chip says
  const pointBuyPoints = pointBuySpent(Object.values(scoresOf(rulesetAbilities, watch("abilities"), rollMethod)));

  // A method that rolls dice rolls each score: they land one by one, the roll keeping the scores so far
  const rollScore = getRollFunction(rollMethod);
  const handleRollAll = (roll: () => number) => {
    const rolled = scoresOf(rulesetAbilities, getValues("abilities"), rollMethod);
    diceRoll.roll(
      rulesetAbilities.map((ability) => ({ key: ability.id, roll })),
      (abilityId, score) => {
        rolled[abilityId] = score;
        setValue("abilities", { ...rolled }, { shouldDirty: true });
      },
    );
  };

  const createCharacterMutation = useMutation({
    mutationFn: async (data: CreateCharacterRequest) =>
      parseResponse(
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
            privateNotes: data.privateNotes || undefined,
          },
        }),
      ),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.characters.lists });
      onClose();
      navigate(`/characters/${data.id}`, { state: { openLevelUp: true } satisfies CharacterPageState });
    },
    onError: (error) => {
      snackbar.error(error, "Failed to create character");
    },
  });

  // The alignment and gender are required: a submit always has them. The scores not set yet are their method's defaults
  const handleCreate = ({ alignment, gender, ...data }: CreateCharacterFormData) => {
    if (!alignment || !gender) return;
    const abilities = scoresOf(rulesetAbilities, data.abilities, rollMethod);
    createCharacterMutation.mutate({ ...data, alignment, gender, abilities });
  };

  // A race the ruleset's list no longer offers is refused, with why
  const raceRules = {
    required: "Race is required",
    validate: (raceId: unknown) => (typeof raceId === "string" && raceIssue(raceId)) || true,
  };

  return (
    <CreateDialog
      open={open}
      onClose={onClose}
      title="Create New Character"
      form={form}
      onSubmit={handleCreate}
      pending={createCharacterMutation.isPending}
      maxWidth="md"
      onExited={onExited}
    >
      <BaseRulesetAlert ruleset={selectedRuleset} />
      <Stack spacing={1}>
        <SubsectionTitle>Basic Information</SubsectionTitle>
        <Stack spacing={3}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <NameField control={control} name="name" label="Character Name" />
            <FormTextField
              control={control}
              name="xp"
              rules={wholeNumberRules(0, "Experience points are required")}
              number
              label="Experience Points"
              fullWidth
            />
          </Stack>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Controller
              name="rulesetId"
              control={control}
              rules={requiredRules("Ruleset is required")}
              render={({ field, fieldState }) => (
                <RulesetPicker
                  options={rulesetOptions}
                  value={selectedRuleset}
                  // Another ruleset's abilities start from their defaults
                  onChange={(ruleset) => {
                    setSelectedRuleset(ruleset);
                    field.onChange(ruleset?.id ?? "");
                    setValue("abilities", {}, { shouldDirty: true });
                    if (!ruleset) setValue("raceId", "", { shouldDirty: true });
                  }}
                  error={fieldState.error}
                  inputRef={field.ref}
                />
              )}
            />

            <SelectField
              control={control}
              name="raceId"
              label="Race"
              rules={raceRules}
              helperText={raceIssue(selectedRaceId)}
              loadError={racesError}
              options={races.map((race) => ({ value: race.id, label: race.name, disabled: !race.eligible }))}
              disabled={!selectedRulesetId}
              onMenuScroll={handleRacesScroll}
            />
          </Stack>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <SelectField
              control={control}
              name="alignment"
              label="Alignment"
              rules={requiredRules("Alignment is required")}
              options={ALIGNMENT_OPTIONS}
            />
            <SelectField
              control={control}
              name="gender"
              label="Gender"
              rules={requiredRules("Gender is required")}
              options={GENDER_OPTIONS}
            />
          </Stack>
        </Stack>
      </Stack>

      <Stack spacing={1}>
        <SubsectionTitle>Ability Scores</SubsectionTitle>
        <Stack spacing={3}>
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
                setValue("abilities", {}, { shouldDirty: true });
              }}
              size="small"
              sx={{ minWidth: 200 }}
            >
              {ROLL_METHODS.map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  {m.label}
                </MenuItem>
              ))}
            </TextField>
            {rollScore && (
              <RollAllButton
                onClick={() => handleRollAll(rollScore)}
                disabled={!rulesetAbilities.length || diceRoll.rolling}
              />
            )}
            {rollMethod === "point-buy" && (
              <CountChip
                label={formatPointsSpent(pointBuyPoints, POINT_BUY_TOTAL)}
                color={
                  pointBuyPoints > POINT_BUY_TOTAL
                    ? "error"
                    : pointBuyPoints === POINT_BUY_TOTAL
                      ? "success"
                      : "default"
                }
              />
            )}
          </Stack>
          {rulesetAbilities.length > 0 ? (
            <AbilityScoresField
              abilities={rulesetAbilities}
              control={control}
              diceRoll={diceRoll}
              method={rollMethod}
            />
          ) : abilitiesError ? (
            <LoadError what="Abilities" error={abilitiesError} />
          ) : abilitiesLoading ? (
            <DiceSpinner sx={{ py: 4 }} />
          ) : (
            <BlankNote>
              {selectedRulesetId ? "No abilities in this ruleset" : "Pick a ruleset to see its abilities"}
            </BlankNote>
          )}
        </Stack>
      </Stack>

      <Stack spacing={1}>
        <SubsectionTitle>Physical Details</SubsectionTitle>
        <Stack spacing={3}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <FormTextField
              control={control}
              name="age"
              rules={wholeNumberRules(1)}
              number
              label="Age"
              slotProps={{ htmlInput: { min: 1 } }}
              fullWidth
            />
            <FormTextField
              control={control}
              name="height"
              label="Height"
              placeholder="e.g., 5 feet 8 inches"
              fullWidth
            />
            <FormTextField control={control} name="weight" label="Weight" placeholder="e.g., 150 lbs, 68kg" fullWidth />
          </Stack>
        </Stack>
      </Stack>

      <Stack spacing={1}>
        <SubsectionTitle>Optional Details</SubsectionTitle>
        <Stack spacing={3}>
          <FormTextField control={control} name="deity" label="Deity" fullWidth />
          <DescriptionField
            control={control}
            name="description"
            placeholder="Character appearance, personality, or background…"
          />
          <NotesField control={control} name="notes" />
          <PrivateNotesField control={control} name="privateNotes" />
        </Stack>
      </Stack>
    </CreateDialog>
  );
}
