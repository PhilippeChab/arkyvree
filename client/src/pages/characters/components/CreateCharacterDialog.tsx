import { IconButton, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { keepPreviousData, useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useMemo, useState } from "react";
import { type Control, Controller, useController, useWatch } from "react-hook-form";
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
  type CharacterCreation,
  characterCreationQuery,
  type CreationMethod,
  creationOptionsQuery,
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
  type CreationPick,
  emptyNewCharacter,
  narrowingKeysOf,
  narrowingOf,
  scoredRolesOf,
  sentCreationFieldsOf,
} from "./newCharacter.ts";

interface CreateCharacterDialogProps {
  onClose: () => void;
  /** It has faded out: its opener lets it go, so the next opening starts clean. */
  onExited: () => void;
  open: boolean;
}

/** A creation pick's field: its options, as the fields that narrow them hold, each eligible or not. */
interface CreationPickFieldProps {
  control: Control<CreateCharacterFormData>;
  item: CreationPick;
  /** What the fields that narrow the options hold, by their keys */
  narrowing: Record<string, string>;
  rulesetId: string;
}

/** A point buy's scores, and their change. */
interface PointBuyScoresProps extends SetScoresProps {
  method: PointBuyMethod;
}

interface ScoreCardProps {
  bottomInfo: string;
  canDecrease: boolean;
  canIncrease: boolean;
  isSettled?: boolean;
  name: string;
  onDecrease: () => void;
  onIncrease: () => void;
  score: number;
}

/** A scored link's scores, its form's `scores.<role>`, set the way its method sets them. */
interface ScoresFieldProps {
  control: Control<CreateCharacterFormData>;
  /** How the ruleset sets its scores: their bounds and modifiers. */
  creation: CharacterCreation;
  /** The dialog's roll of the scores, which they show as it tumbles. */
  diceRoll: DiceRoll;
  entities: ScoredEntity[];
  method: CreationMethod;
  role: string;
}

/** The scores a method that sets them shows (a point buy, an array), and their change. */
interface SetScoresProps {
  entities: ScoredEntity[];
  onChange: (scores: Record<string, number>) => void;
  values: Record<string, number> | undefined;
}

/** An array's scores, each with its modifier, and their change. */
interface StandardArrayScoresProps extends SetScoresProps {
  method: ArrayMethod;
  modifiers: CharacterCreation["modifiers"];
}

/** The scores taken from an array, each entity one of them. */
type ArrayMethod = Extract<CreationMethod, { kind: "array" }>;

/** The scores bought out of a budget, each at its cost. */
type PointBuyMethod = Extract<CreationMethod, { kind: "pointBuy" }>;

/** The scores rolled with dice. */
type RollMethod = Extract<CreationMethod, { kind: "roll" }>;

/** An entity a scored link scores (3.5's ability), in the order its sheets list them. */
type ScoredEntity = CharacterCreation["entities"][number];

/** A new character's form before its rules' fields are known: nothing picked, no score set. */
const NO_CHARACTER_YET: CreateCharacterFormData = { rulesetId: "", name: "", picks: {}, scores: {}, notes: "" };

/**
 * A new character's creation pick (`item`: 3.5's race), its form's `picks.<role>`: the options its ruleset offers,
 * each eligible or not for what the fields that narrow them hold. One the list for the ruleset and those fields
 * doesn't offer, once it has loaded, is refused, and the field says why; while a new list loads, the previous one is
 * still shown, and a failed load says nothing.
 */
function CreationPickField({ control, item, narrowing, rulesetId }: CreationPickFieldProps) {
  const name = `picks.${item.role}`;
  const {
    items: options,
    isPending,
    isPlaceholderData,
    error,
    onScroll,
  } = useListboxQuery({
    ...creationOptionsQuery(rulesetId, item.role, narrowing),
    placeholderData: keepPreviousData,
  });
  const picked = useWatch({ control, name });
  const settled = !!rulesetId && !isPending && !isPlaceholderData && !error;
  const issueOf = (id: unknown) => {
    if (typeof id !== "string" || !id || !settled) return undefined;
    const option = options.find((candidate) => candidate.id === id);
    if (!option) return "Not in this ruleset: pick another";
    return option.eligible ? undefined : item.ineligible;
  };
  // An option the list no longer offers is refused, with why
  const pickRules = { required: item.required, validate: (id: unknown) => issueOf(id) || true };
  return (
    <SelectField
      control={control}
      name={name}
      label={item.label}
      rules={pickRules}
      helperText={issueOf(picked)}
      loadError={error}
      options={options.map((option) => ({ value: option.id, label: option.name, disabled: !option.eligible }))}
      disabled={!rulesetId}
      onMenuScroll={onScroll}
    />
  );
}

/**
 * An entity's score before one is set: a point buy's lowest to buy from, an array's in order, else the rules'
 * starting score (`start`).
 */
function defaultScore(method: CreationMethod, index: number, start: number) {
  if (method.kind === "pointBuy") return method.min;
  if (method.kind === "array") return method.scores[index] ?? method.scores[method.scores.length - 1];
  return start;
}

/** A line's item's React key: its field's key, a pick's role, else its kind (the form's own are one each). */
function itemKeyOf(item: CreationItem) {
  if ("key" in item) return item.key;
  return item.kind === "pick" ? item.role : item.kind;
}

/** What a point buy's scores cost: each score's price, summed. */
function pointBuyCost(method: PointBuyMethod, scores: number[]) {
  return pointsSpent(scores.map((score) => method.costs[score] ?? 0));
}

function PointBuyScores({ entities, values, method, onChange }: PointBuyScoresProps) {
  const pointsRemaining =
    method.budget -
    pointBuyCost(
      method,
      entities.map((entity) => values?.[entity.id] ?? method.min),
    );

  return (
    <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
      {entities.map((entity) => {
        const score = values?.[entity.id] ?? method.min;
        const costNow = method.costs[score] ?? 0;
        const costNext = method.costs[score + 1];
        const canIncrease = score < method.max && costNext !== undefined && costNext - costNow <= pointsRemaining;
        const canDecrease = score > method.min;

        return (
          <ScoreCard
            key={entity.id}
            name={entity.name}
            score={score}
            onIncrease={() => onChange({ ...values, [entity.id]: score + 1 })}
            onDecrease={() => onChange({ ...values, [entity.id]: score - 1 })}
            canIncrease={canIncrease}
            canDecrease={canDecrease}
            bottomInfo={`Cost: ${costNow}`}
          />
        );
      })}
    </Stack>
  );
}

function ScoreCard({
  name,
  score,
  onIncrease,
  onDecrease,
  canIncrease,
  canDecrease,
  bottomInfo,
  isSettled,
}: ScoreCardProps) {
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

/**
 * A new character's scores of a scored link (3.5's abilities), its form's `scores.<role>`, set as its method sets them.
 */
function ScoresField({ control, creation, diceRoll, entities, role, method }: ScoresFieldProps) {
  const {
    field: { value, onChange },
  } = useController({ control, name: `scores.${role}` });
  const values = scoresOf(entities, value as Record<string, number> | undefined, method, creation.scores.start);
  const { max, min } = creation.scores;

  if (method.kind === "array") {
    return (
      <StandardArrayScores
        entities={entities}
        values={values}
        method={method}
        modifiers={creation.modifiers}
        onChange={onChange}
      />
    );
  }

  if (method.kind === "pointBuy")
    return <PointBuyScores entities={entities} values={values} method={method} onChange={onChange} />;

  return (
    <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
      {entities.map((entity) => {
        // A score rolling shows its die's faces until it lands
        const score = diceRoll.faceOf(entity.id) ?? values[entity.id];
        return (
          <ScoreCard
            key={entity.id}
            name={entity.name}
            score={score}
            onIncrease={() => onChange({ ...values, [entity.id]: Math.min(max, score + 1) })}
            onDecrease={() => onChange({ ...values, [entity.id]: Math.max(min, score - 1) })}
            canIncrease={!diceRoll.rolling && score < max}
            canDecrease={!diceRoll.rolling && score > min}
            bottomInfo={`Mod: ${formatSigned(creation.modifiers[score])}`}
            isSettled={diceRoll.hasLanded(entity.id)}
          />
        );
      })}
    </Stack>
  );
}

/** Every entity's score: the one set, or its method's default (`start`, the rules' starting score, for a roll). */
function scoresOf(
  entities: ScoredEntity[],
  values: Record<string, number> | undefined,
  method: CreationMethod,
  start: number,
) {
  return Object.fromEntries(
    entities.map((entity, index) => [entity.id, values?.[entity.id] ?? defaultScore(method, index, start)]),
  );
}

function StandardArrayScores({ entities, values, method, modifiers, onChange }: StandardArrayScoresProps) {
  // A score already given to another entity swaps with this one's
  const handleChange = (entityId: string, newValue: number) => {
    if (!values) return;
    const next = { ...values };
    const swapId = entities.find((other) => other.id !== entityId && values[other.id] === newValue)?.id;
    if (swapId) next[swapId] = values[entityId] ?? method.scores[method.scores.length - 1];
    next[entityId] = newValue;
    onChange(next);
  };

  const sortedAsc = [...method.scores].sort((a, b) => a - b);

  return (
    <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
      {entities.map((entity) => {
        const score = values?.[entity.id] ?? method.scores[0];
        const idx = sortedAsc.indexOf(score);
        const canIncrease = idx !== -1 && idx < sortedAsc.length - 1;
        const canDecrease = idx > 0;

        return (
          <ScoreCard
            key={entity.id}
            name={entity.name}
            score={score}
            onIncrease={() => canIncrease && handleChange(entity.id, sortedAsc[idx + 1])}
            onDecrease={() => canDecrease && handleChange(entity.id, sortedAsc[idx - 1])}
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
 * A new character: its ruleset, its creation's picks and details, and its scores by the roll method picked, laid out as
 * its rules' form describes it (the picked ruleset's base rules', the first's until one is picked). Mounted while it's
 * open, its form, its pickers and its roll methods start clean at each opening.
 */
export function CreateCharacterDialog({ open, onClose, onExited }: CreateCharacterDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const diceRoll = useDiceRoll();
  // Each scored link's method picked, by its role: its first until one is
  const [methodIds, setMethodIds] = useState<Record<string, string>>({});
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

  // What the fields that narrow the creation picks' options hold
  const narrowingKeys = characterForm ? narrowingKeysOf(characterForm) : [];
  const narrowing = narrowingOf(narrowingKeys, watch(narrowingKeys));

  // How the ruleset sets each scored link's scores, its entities in its sheets' order
  const scoredRoles = characterForm ? scoredRolesOf(characterForm) : [];
  const creations = useQueries({
    queries: scoredRoles.map((role) => characterCreationQuery(selectedRulesetId, role)),
  });
  const creationOf = (role: string) => creations[scoredRoles.indexOf(role)];
  const methodOf = (creation: CharacterCreation | undefined, role: string) =>
    creation?.methods.find((m) => m.id === methodIds[role]) ?? creation?.methods[0];

  // A method that rolls dice rolls each score: they land one by one, the roll keeping the scores so far
  const handleRollAll = (role: string, entities: ScoredEntity[], rollMethod: RollMethod, start: number) => {
    const name = `scores.${role}`;
    const rolled = scoresOf(entities, getValues(name) as Record<string, number> | undefined, rollMethod, start);
    diceRoll.roll(
      entities.map((entity) => ({ key: entity.id, roll: () => rollDice(rollMethod.dice) })),
      (entityId, score) => {
        rolled[entityId] = score;
        setValue(name, { ...rolled }, { shouldDirty: true });
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
    const scores = Object.fromEntries(
      scoredRoles.map((role) => {
        const creation = creationOf(role).data;
        const method = methodOf(creation, role);
        const given = data.scores[role];
        return [role, creation && method ? scoresOf(creation.entities, given, method, creation.scores.start) : given];
      }),
    );
    createCharacterMutation.mutate({
      rulesetId: data.rulesetId,
      name: data.name,
      picks: data.picks,
      scores,
      notes: data.notes || undefined,
      fields: sentCreationFieldsOf(characterForm, data),
    });
  };

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
                // Another ruleset's scores start from their defaults
                onChange={(ruleset) => {
                  setPickedRuleset(ruleset);
                  field.onChange(ruleset?.id ?? "");
                  for (const role of scoredRoles) setValue(`scores.${role}`, {}, { shouldDirty: true });
                  // Without a ruleset, no creation pick stands
                  const picks = ruleset ? [] : Object.keys(getValues("picks"));
                  for (const key of picks) setValue(`picks.${key}`, "", { shouldDirty: true });
                }}
                error={fieldState.error}
                inputRef={field.ref}
              />
            )}
          />
        );
      case "pick":
        return (
          <CreationPickField
            key={item.role}
            control={control}
            item={item}
            narrowing={narrowing}
            rulesetId={selectedRulesetId}
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

  /** A scored link's scores, under their section's title, set the way the method picked sets them. */
  const renderScores = (section: Extract<CharacterForm["sections"][number], { kind: "scores" }>) => {
    const { role } = section;
    const { data: creation, error: creationError, isLoading: creationLoading } = creationOf(role);
    const entities = creation?.entities ?? [];
    const method = methodOf(creation, role);
    // What a point buy's scores cost, its chip says
    const given = watch(`scores.${role}`) as Record<string, number> | undefined;
    const pointBuyPoints =
      creation && method?.kind === "pointBuy"
        ? pointBuyCost(method, Object.values(scoresOf(entities, given, method, creation.scores.start)))
        : 0;
    return (
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
                  setMethodIds((picked) => ({ ...picked, [role]: e.target.value }));
                  setValue(`scores.${role}`, {}, { shouldDirty: true });
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
                  onClick={() => handleRollAll(role, entities, method, creation.scores.start)}
                  disabled={!entities.length || diceRoll.rolling}
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
          {entities.length > 0 && creation && method ? (
            <ScoresField
              control={control}
              creation={creation}
              diceRoll={diceRoll}
              entities={entities}
              role={role}
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
      // Nothing to create until its form shows
      submitDisabled={!characterForm}
    >
      <BaseRulesetAlert ruleset={selectedRuleset} />
      {characterForm ? (
        characterForm.sections.map((section) =>
          section.kind === "scores" ? (
            renderScores(section)
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
