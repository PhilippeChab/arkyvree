import { IconButton, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useMemo, useState } from "react";
import { type Control, Controller, useController } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import { NotesField } from "@/client/src/components/characters/index.ts";
import {
  BlankNote,
  CountChip,
  CreateDialog,
  DiceSpinner,
  FormTextField,
  LoadError,
  NameField,
  SelectField,
  SubsectionTitle,
  TextAreaField,
} from "@/client/src/components/common/index.ts";
import { AddIcon, RemoveIcon } from "@/client/src/components/icons/index.ts";
import {
  BaseRulesetAlert,
  type RulesetOption,
  RulesetPicker,
  useRulesetPickerOptions,
} from "@/client/src/components/rulesets/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormWith, useListboxQuery, useRules } from "@/client/src/hooks/index.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { requiredRules, wholeNumberRules } from "@/client/src/lib/validation.ts";
import type { CharacterPageState } from "@/client/src/pages/characters/characterPageState.ts";
import {
  availableRacesQuery,
  type CharacterCreation,
  characterCreationQuery,
  type CreationMethod,
} from "@/client/src/pages/characters/characterQueries.ts";
import { rollDice } from "@/client/src/pages/characters/dice.ts";
import { formatPointsSpent, pointsSpent } from "@/client/src/pages/characters/pointsSpent.ts";
import { RollAllButton } from "@/client/src/pages/characters/RollAllButton.tsx";
import { type DiceRoll, useDiceRoll } from "@/client/src/pages/characters/useDiceRoll.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { PREFERS_REDUCED_MOTION, settleAnimation } from "@/client/src/theme/animations.ts";
import { formatSigned } from "@/shared/text.ts";

import {
  type CharacterForm,
  type CreateCharacterFormData,
  type CreateCharacterRequest,
  type CreationItem,
  emptyNewCharacter,
  racePickKeysOf,
  racePicksOf,
  sentCreationFieldsOf,
} from "./newCharacter.ts";

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

interface AbilityScoresFieldProps {
  abilities: AbilityOption[];
  control: Control<CreateCharacterFormData>;
  /** How the ruleset sets its scores: their bounds and modifiers. */
  creation: CharacterCreation;
  /** The dialog's roll of the scores, which they show as it tumbles. */
  diceRoll: DiceRoll;
  method: CreationMethod;
}

interface CreateCharacterDialogProps {
  onClose: () => void;
  /** It has faded out: its opener lets it go, so the next opening starts clean. */
  onExited: () => void;
  open: boolean;
}

/** A point buy's scores, and their change. */
interface PointBuyScoresProps extends SetScoresProps {
  method: PointBuyMethod;
}

/** The scores a method that sets them shows (a point buy, an array), and their change. */
interface SetScoresProps {
  abilities: AbilityOption[];
  abilityValues: Record<string, number> | undefined;
  onChange: (scores: Record<string, number>) => void;
}

/** An array's scores, each with its modifier, and their change. */
interface StandardArrayScoresProps extends SetScoresProps {
  method: ArrayMethod;
  modifiers: CharacterCreation["modifiers"];
}

/** An ability of the ruleset, in the order its sheets list them. */
type AbilityOption = CharacterCreation["abilities"][number];

/** The scores taken from an array, each ability one of them. */
type ArrayMethod = Extract<CreationMethod, { kind: "array" }>;

/** The scores bought out of a budget, each at its cost. */
type PointBuyMethod = Extract<CreationMethod, { kind: "pointBuy" }>;

/** The scores rolled with dice. */
type RollMethod = Extract<CreationMethod, { kind: "roll" }>;

/** A new character's form before its rules' fields are known: nothing picked, no score set. */
const NO_CHARACTER_YET: CreateCharacterFormData = { rulesetId: "", raceId: "", name: "", abilities: {}, notes: "" };

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

/** The new character's ability scores, its form's `abilities`, set the way its method sets them. */
function AbilityScoresField({ abilities, control, creation, diceRoll, method }: AbilityScoresFieldProps) {
  const {
    field: { value, onChange },
  } = useController({ control, name: "abilities" });
  const abilityValues = scoresOf(abilities, value, method, creation.scores.start);
  const { max, min } = creation.scores;

  if (method.kind === "array") {
    return (
      <StandardArrayScores
        abilities={abilities}
        abilityValues={abilityValues}
        method={method}
        modifiers={creation.modifiers}
        onChange={onChange}
      />
    );
  }

  if (method.kind === "pointBuy")
    return <PointBuyScores abilities={abilities} abilityValues={abilityValues} method={method} onChange={onChange} />;

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
            onIncrease={() => onChange({ ...abilityValues, [ability.id]: Math.min(max, score + 1) })}
            onDecrease={() => onChange({ ...abilityValues, [ability.id]: Math.max(min, score - 1) })}
            canIncrease={!diceRoll.rolling && score < max}
            canDecrease={!diceRoll.rolling && score > min}
            bottomInfo={`Mod: ${formatSigned(creation.modifiers[score])}`}
            isSettled={diceRoll.hasLanded(ability.id)}
          />
        );
      })}
    </Stack>
  );
}

/**
 * An ability's score before one is set: a point buy's lowest to buy from, an array's in order, else the rules'
 * starting score (`start`).
 */
function defaultScore(method: CreationMethod, index: number, start: number) {
  if (method.kind === "pointBuy") return method.min;
  if (method.kind === "array") return method.scores[index] ?? method.scores[method.scores.length - 1];
  return start;
}

/** A line's item's React key: its field's key, else its kind (the form's own are one each). */
function itemKeyOf(item: CreationItem) {
  return "key" in item ? item.key : item.kind;
}

/** What a point buy's scores cost: each score's price, summed. */
function pointBuyCost(method: PointBuyMethod, scores: number[]) {
  return pointsSpent(scores.map((score) => method.costs[score] ?? 0));
}

function PointBuyScores({ abilities, abilityValues, method, onChange }: PointBuyScoresProps) {
  const pointsRemaining =
    method.budget -
    pointBuyCost(
      method,
      abilities.map((a) => abilityValues?.[a.id] ?? method.min),
    );

  return (
    <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
      {abilities.map((ability) => {
        const score = abilityValues?.[ability.id] ?? method.min;
        const costNow = method.costs[score] ?? 0;
        const costNext = method.costs[score + 1];
        const canIncrease = score < method.max && costNext !== undefined && costNext - costNow <= pointsRemaining;
        const canDecrease = score > method.min;

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

/** Every ability's score: the one set, or its method's default (`start`, the rules' starting score, for a roll). */
function scoresOf(
  abilities: AbilityOption[],
  values: Record<string, number> | undefined,
  method: CreationMethod,
  start: number,
) {
  return Object.fromEntries(
    abilities.map((ability, index) => [ability.id, values?.[ability.id] ?? defaultScore(method, index, start)]),
  );
}

function StandardArrayScores({ abilities, abilityValues, method, modifiers, onChange }: StandardArrayScoresProps) {
  // A score already given to another ability swaps with this one's
  const handleChange = (abilityId: string, newValue: number) => {
    if (!abilityValues) return;
    const next = { ...abilityValues };
    const swapId = abilities.find((a) => a.id !== abilityId && abilityValues[a.id] === newValue)?.id;
    if (swapId) next[swapId] = abilityValues[abilityId] ?? method.scores[method.scores.length - 1];
    next[abilityId] = newValue;
    onChange(next);
  };

  const sortedAsc = [...method.scores].sort((a, b) => a - b);

  return (
    <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
      {abilities.map((ability) => {
        const score = abilityValues?.[ability.id] ?? method.scores[0];
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
            bottomInfo={`Mod: ${formatSigned(modifiers[score])}`}
          />
        );
      })}
    </Stack>
  );
}

/**
 * A new character: its ruleset, race and details, and its ability scores by the roll method picked, laid out as its
 * rules' form describes it (the picked ruleset's base rules', the first's until one is picked). Mounted while it's open,
 * its form, its pickers and its roll method start clean at each opening.
 */
export function CreateCharacterDialog({ open, onClose, onExited }: CreateCharacterDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const diceRoll = useDiceRoll();
  const [methodId, setMethodId] = useState("");
  const rulesetOptions = useRulesetPickerOptions("character", open);
  const { preselected } = rulesetOptions;
  const { all: allRules, error: rulesError } = useRules();
  const [pickedRuleset, setPickedRuleset] = useState<RulesetOption | null>(null);
  // Its rules' form: the picked ruleset's base rules', else the user's own ruleset's, else the first's
  const formRuleset = pickedRuleset ?? preselected;
  const characterForm =
    (formRuleset && allRules?.[formRuleset.baseRules]?.characterForm) ??
    (allRules && Object.values(allRules)[0]?.characterForm);
  // Its fields start once its form is known, and the user's own ruleset is picked once it's known, unless the user
  // picked one already
  const preselectedId = preselected?.id;
  const values = useMemo(
    () =>
      characterForm && {
        ...emptyNewCharacter(characterForm),
        ...(preselectedId && { rulesetId: preselectedId }),
      },
    [characterForm, preselectedId],
  );
  const form = useFormWith<CreateCharacterFormData>(NO_CHARACTER_YET, {
    values,
    resetOptions: { keepDirtyValues: true },
  });
  const { control, getValues, watch, setValue } = form;

  const selectedRulesetId = watch("rulesetId");
  // The ruleset the form holds: the one picked, else the user's own the dialog started on
  const selectedRuleset = pickedRuleset ?? (preselected?.id === selectedRulesetId ? preselected : null);

  // Fetch races for selected ruleset, annotated with eligibility for what the fields that narrow them say
  const racePickKeys = characterForm ? racePickKeysOf(characterForm) : [];
  const racePicks = racePicksOf(racePickKeys, watch(racePickKeys));
  const {
    items: races,
    isPending: isRacesPending,
    isPlaceholderData: isRacesPlaceholder,
    error: racesError,
    onScroll: handleRacesScroll,
  } = useListboxQuery({
    ...availableRacesQuery(selectedRulesetId, racePicks),
    placeholderData: keepPreviousData,
  });

  // A race the list for the current ruleset and picks doesn't offer, once it has loaded, is refused, and the field says
  // why. While a new list loads, the previous one is still shown, and a failed load says nothing.
  const selectedRaceId = watch("raceId");
  const racesSettled = !!selectedRulesetId && !isRacesPending && !isRacesPlaceholder && !racesError;
  const raceIssue = (raceId: string, ineligible: string) => {
    if (!raceId || !racesSettled) return undefined;
    const race = races.find((r) => r.id === raceId);
    if (!race) return "Not in this ruleset: pick another";
    return race.eligible ? undefined : ineligible;
  };

  // How the ruleset sets its scores, its abilities in its sheets' order, and the method picked: its first until one is
  const {
    data: creation,
    error: creationError,
    isLoading: creationLoading,
  } = useQuery(characterCreationQuery(selectedRulesetId));
  const rulesetAbilities = creation?.abilities ?? [];
  const method = creation?.methods.find((m) => m.id === methodId) ?? creation?.methods[0];

  // What a point buy's scores cost, its chip says
  const abilityValues = watch("abilities");
  const pointBuyPoints =
    creation && method?.kind === "pointBuy"
      ? pointBuyCost(method, Object.values(scoresOf(rulesetAbilities, abilityValues, method, creation.scores.start)))
      : 0;

  // A method that rolls dice rolls each score: they land one by one, the roll keeping the scores so far
  const handleRollAll = (rollMethod: RollMethod, start: number) => {
    const rolled = scoresOf(rulesetAbilities, getValues("abilities"), rollMethod, start);
    diceRoll.roll(
      rulesetAbilities.map((ability) => ({ key: ability.id, roll: () => rollDice(rollMethod.dice) })),
      (abilityId, score) => {
        rolled[abilityId] = score;
        setValue("abilities", { ...rolled }, { shouldDirty: true });
      },
    );
  };

  const createCharacterMutation = useMutation({
    mutationFn: async (json: CreateCharacterRequest) => parseResponse(rpc.api.characters.$post({ json })),
    onSuccess: (data) => {
      snackbar.success("Character created");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.characters.lists });
      onClose();
      navigate(`/characters/${data.id}`, { state: { openLevelUp: true } satisfies CharacterPageState });
    },
    onError: (error) => {
      snackbar.error(error, "Failed to create character");
    },
  });

  // Its fields as its rules' form keys them; the scores not set yet are their method's defaults
  const handleCreate = (data: CreateCharacterFormData) => {
    if (!characterForm) return;
    const abilities =
      creation && method ? scoresOf(rulesetAbilities, data.abilities, method, creation.scores.start) : data.abilities;
    createCharacterMutation.mutate({
      rulesetId: data.rulesetId,
      raceId: data.raceId,
      name: data.name,
      abilities,
      notes: data.notes || undefined,
      fields: sentCreationFieldsOf(characterForm, data),
    });
  };

  // A race the ruleset's list no longer offers is refused, with why
  const raceRulesOf = (item: Extract<CreationItem, { kind: "race" }>) => ({
    required: item.required,
    validate: (raceId: unknown) => (typeof raceId === "string" && raceIssue(raceId, item.ineligible)) || true,
  });

  /** An item of a line of the form: one of the form's own, or one of its rules' fields, by its kind. */
  const renderItem = (item: CreationItem) => {
    switch (item.kind) {
      case "name":
        return <NameField key="name" control={control} name="name" label={item.label} />;
      case "notes":
        return <NotesField key="notes" control={control} name="notes" />;
      case "ruleset":
        return (
          <Controller
            key="ruleset"
            name="rulesetId"
            control={control}
            rules={requiredRules("Ruleset is required")}
            render={({ field, fieldState }) => (
              <RulesetPicker
                options={rulesetOptions}
                value={selectedRuleset}
                // Another ruleset's abilities start from their defaults
                onChange={(ruleset) => {
                  setPickedRuleset(ruleset);
                  field.onChange(ruleset?.id ?? "");
                  setValue("abilities", {}, { shouldDirty: true });
                  if (!ruleset) setValue("raceId", "", { shouldDirty: true });
                }}
                error={fieldState.error}
                inputRef={field.ref}
              />
            )}
          />
        );
      case "race":
        return (
          <SelectField
            key="race"
            control={control}
            name="raceId"
            label={item.label}
            rules={raceRulesOf(item)}
            helperText={raceIssue(selectedRaceId, item.ineligible)}
            loadError={racesError}
            options={races.map((race) => ({ value: race.id, label: race.name, disabled: !race.eligible }))}
            disabled={!selectedRulesetId}
            onMenuScroll={handleRacesScroll}
          />
        );
      case "number":
        return (
          <FormTextField
            key={item.key}
            control={control}
            name={item.key}
            rules={wholeNumberRules(item.min, item.required ?? false)}
            number
            label={item.label}
            // Its input's own arrows stop at its least
            {...(item.stepped && { slotProps: { htmlInput: { min: item.min } } })}
            fullWidth
          />
        );
      case "select":
        return (
          <SelectField
            key={item.key}
            control={control}
            name={item.key}
            label={item.label}
            rules={item.required ? requiredRules(item.required) : undefined}
            options={item.options}
          />
        );
      case "text":
        return (
          <FormTextField
            key={item.key}
            control={control}
            name={item.key}
            label={item.label}
            placeholder={item.placeholder}
            fullWidth
          />
        );
      case "textarea":
        return (
          <TextAreaField
            key={item.key}
            control={control}
            name={item.key}
            label={item.label}
            placeholder={item.placeholder}
          />
        );
    }
  };

  /** The form's ability scores, under their section's title, set the way the method picked sets them. */
  const renderAbilities = (section: Extract<CharacterForm["sections"][number], { kind: "abilities" }>) => (
    <Stack key={section.title} spacing={1}>
      <SubsectionTitle>{section.title}</SubsectionTitle>
      <Stack spacing={3}>
        {creation && method && (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <TextField
              select
              label="Method"
              value={method.id}
              onChange={(e) => {
                // Another method's scores start from its defaults
                setMethodId(e.target.value);
                setValue("abilities", {}, { shouldDirty: true });
              }}
              size="small"
              sx={{ minWidth: 200 }}
            >
              {creation.methods.map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  {m.label}
                </MenuItem>
              ))}
            </TextField>
            {method.kind === "roll" && (
              <RollAllButton
                onClick={() => handleRollAll(method, creation.scores.start)}
                disabled={!rulesetAbilities.length || diceRoll.rolling}
              />
            )}
            {method.kind === "pointBuy" && (
              <CountChip
                label={formatPointsSpent(pointBuyPoints, method.budget)}
                // Its increases stop at its budget: spent whole, or not yet
                color={pointBuyPoints === method.budget ? "success" : "default"}
              />
            )}
          </Stack>
        )}
        {rulesetAbilities.length > 0 && creation && method ? (
          <AbilityScoresField
            abilities={rulesetAbilities}
            control={control}
            creation={creation}
            diceRoll={diceRoll}
            method={method}
          />
        ) : creationError ? (
          <LoadError what={section.title} error={creationError} />
        ) : creationLoading ? (
          <DiceSpinner sx={{ py: 4 }} />
        ) : (
          <BlankNote>{selectedRulesetId ? section.none : section.pick}</BlankNote>
        )}
      </Stack>
    </Stack>
  );

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
      // Nothing to create until its form shows
      submitDisabled={!characterForm}
    >
      <BaseRulesetAlert ruleset={selectedRuleset} />
      {characterForm ? (
        characterForm.sections.map((section) =>
          section.kind === "abilities" ? (
            renderAbilities(section)
          ) : (
            <Stack key={section.title} spacing={1}>
              <SubsectionTitle>{section.title}</SubsectionTitle>
              <Stack spacing={3}>
                {section.lines.map((line) =>
                  // A line of one item stands alone; of several, side by side from a tablet's width
                  line.length === 1 ? (
                    renderItem(line[0])
                  ) : (
                    <Stack key={line.map(itemKeyOf).join(" ")} direction={{ xs: "column", sm: "row" }} spacing={2}>
                      {line.map(renderItem)}
                    </Stack>
                  ),
                )}
              </Stack>
            </Stack>
          ),
        )
      ) : rulesError ? (
        <LoadError what="Character Form" error={rulesError} />
      ) : (
        <DiceSpinner sx={{ py: 4 }} />
      )}
    </CreateDialog>
  );
}
