import { Autocomplete, Box, FormHelperText, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { type Ref, useEffect, useId } from "react";
import {
  type ArrayPath,
  type FieldPath,
  type FieldValues,
  useController,
  useFieldArray,
  type UseFormReturn,
  useWatch,
} from "react-hook-form";

import {
  AddButton,
  DiceSpinner,
  EMPTY_VALUE_TEXT,
  EmptyValue,
  FormTextField,
  LoadError,
  RowAction,
  SelectField,
  SubsectionTitle,
  SwitchField,
  useReadOnlyFields,
  ValueChip,
} from "@/client/src/components/common/index.ts";
import { DeleteIcon } from "@/client/src/components/icons/index.ts";
import { rulesetOptionsQuery } from "@/client/src/lib/queries.ts";
import { DECIMAL_RULES, requiredRules, wholeNumberRules } from "@/client/src/lib/validation.ts";
import type { EntityField, RulesetFields } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { useEntityFields } from "@/client/src/pages/rulesets/hooks/index.ts";
import { countRoomAt, findProgressionIssues } from "@/shared/customization/progression.ts";
import { isOneOf } from "@/shared/isOneOf.ts";

import { AptitudeLevelsInput } from "./AptitudeLevelsInput.tsx";
import type { ColumnContext } from "./columnContext.ts";
import { choiceOptions, isFieldShown, noneLabel, valueAt } from "./entityFields.ts";
import { GrantedFeatsInput } from "./GrantedFeatsInput.tsx";
import { SaveBasesInput } from "./SaveBasesInput.tsx";
import { TemplateInput } from "./TemplateInput.tsx";
import { useTemplateReset } from "./useTemplateReset.ts";

/** What lays out an entity's columns: their description, its form, where they go, and what they read of the entity. */
interface EntityColumnsProps<T extends FieldValues> {
  /** Its rules' (`useEntityColumns`) */
  columns: readonly EntityField[];
  context?: ColumnContext;
  form: UseFormReturn<T>;
  placement: "after" | "before";
  rulesetId: string;
}

/** What lays out an entity's fields: its form, and how they show. */
interface EntityFieldsProps<T extends FieldValues> {
  /** Two side by side past a phone's width, in a form that lays its own out so (a spell's): one a row otherwise. */
  columns?: 1 | 2;
  /** The entity type whose fields they are (`rulesets`: the ruleset's Settings). */
  entityType: keyof RulesetFields;
  form: UseFormReturn<T>;
  /** Each says what it's for under it: a class's do, and the Settings'. */
  help?: boolean;
  rulesetId: string;
}

/** What a field's input takes: the field, its form, and how it shows. */
interface FieldInputProps<T extends FieldValues, F extends EntityField = EntityField> extends FieldsShowing<T> {
  field: F;
}

/** What a grid of fields takes: its fields, and how they show. */
interface FieldsGridProps<T extends FieldValues> extends FieldsShowing<T> {
  fields: readonly EntityField[];
}

/**
 * What every field of a form shares: the form, where their values go in it (`prefix`: `fields.` for its declared
 * fields, none for its columns), how they show, what its columns read of the entity, and the ruleset whose entities
 * they name.
 */
interface FieldsShowing<T extends FieldValues> {
  columns: 1 | 2;
  context: ColumnContext;
  form: UseFormReturn<T>;
  help: boolean;
  /** What a choice's change does besides (`useTemplateReset`: a type's empties its template) */
  onChoiceChange?: (key: string, value: unknown) => void;
  prefix: string;
  rulesetId: string;
}

/** What a three-state flag's select takes: its field, its value and its change, which its owner binds. */
interface FlagSelectProps {
  field: FlagField;
  help: boolean;
  inputRef: Ref<HTMLInputElement>;
  onChange: (value: boolean | null) => void;
  readOnly: boolean;
  value: unknown;
}

/** What a reference's select takes: its field, and the list of the ruleset it picks from. */
interface ReferenceSelectProps<T extends FieldValues> extends FieldInputProps<T, RefField> {
  list: (typeof REFERENCE_LISTS)[number];
}

/** What a field shown on its conditions takes: the paths of the form's values they read, in their order. */
interface ShownFieldProps<T extends FieldValues> extends FieldInputProps<T> {
  paths: string[];
}

/** A yes or no. */
type FlagField = Extract<EntityField, { input: "flag" }>;

/** A level a progression gives more at, as its form holds it. */
type ProgressionExtra = ProgressionField["default"]["extra"][number];

/** What levels give of something: a frequency, and more at the levels it names. */
type ProgressionField = Extract<EntityField, { input: "progression" }>;

/** A field that names an entity of the ruleset. */
type RefField = Extract<EntityField, { input: "ref" }>;

/** A field that holds a choice or a text, one or several. */
type ValuesField = Extract<EntityField, { input: "choice" | "text" }>;

/** A grid of fields: a column, 24px between its rows. */
const FIELDS_GRID_SX = { display: "grid", gridTemplateColumns: "1fr", columnGap: 2, rowGap: 3 };

/** A three-state flag's values, as its select names them; none is "None". */
const FLAG_CHOICES = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
] as const;

/** The column inputs that list links (a spell's aptitudes, a level's saves and feats), below the form's fields. */
const LINK_INPUTS = ["aptitudeLevels", "grantedFeats", "saveBases"] as const;

/** A form that reads nothing of its entity past its values. */
const NO_CONTEXT: ColumnContext = {};

/** A progression's level and its amount, and the action that removes it: two inputs side by side, then the action. */
const PROGRESSION_ROW_SX = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr)) auto",
  columnGap: 1,
  alignItems: "start",
};

/** A progression's inputs' width: its frequency's and its levels' rows', which line up. */
const PROGRESSION_WIDTH_SX = { maxWidth: "28rem" };

/** The lists of a ruleset a reference picks from, by the kind of entity it names. */
const REFERENCE_LISTS = ["abilities", "saves"] as const;

/** Two columns past a phone's width. */
const TWO_COLUMNS_SX = { gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" } };

/** A field that takes the grid's whole width: a group, or a list of values. */
const WIDE_FIELD_SX = { gridColumn: "1 / -1" };

/** A field's input, by its kind: a select, several values, a number, a yes or no, a text, an entity of the ruleset. */
function FieldInput<T extends FieldValues>({ field, ...props }: FieldInputProps<T>) {
  const { form, help } = props;
  if (field.input === "group") {
    return (
      <Stack spacing={1}>
        <SubsectionTitle>{field.label}</SubsectionTitle>
        <FieldsGrid {...props} fields={field.fields} />
      </Stack>
    );
  }
  const name = formPath<T>(`${props.prefix}${field.key}`);
  const helperText = help ? field.help : undefined;
  const locked = props.context.locked?.includes(field.key) ?? false;
  switch (field.input) {
    case "flag":
      return field.nullable ? (
        <FlagField {...props} field={field} />
      ) : (
        <SwitchField control={form.control} name={name} label={field.label} />
      );
    case "number":
      return (
        <FormTextField
          control={form.control}
          name={name}
          rules={wholeNumberRules(field.min, field.default === null ? false : `${field.label} is required`, field.max)}
          number
          label={labelOf(field)}
          fullWidth
          helperText={helperText}
          slotProps={{ htmlInput: { min: field.min, max: field.max } }}
        />
      );
    case "decimal":
      return (
        <FormTextField
          control={form.control}
          name={name}
          rules={DECIMAL_RULES}
          label={labelOf(field)}
          type="text"
          fullWidth
          helperText={helperText}
          slotProps={{ htmlInput: { inputMode: "decimal" } }}
        />
      );
    case "aptitudeLevels":
      return <AptitudeLevelsInput {...props} field={field} name={name} />;
    case "grantedFeats":
      return <GrantedFeatsInput {...props} field={field} name={name} />;
    case "saveBases":
      return <SaveBasesInput {...props} field={field} name={name} />;
    case "template":
      return <TemplateInput {...props} field={field} name={name} />;
    case "progression":
      return <ProgressionInput {...props} field={field} />;
    case "ref":
      if (isOneOf(field.references, REFERENCE_LISTS))
        return <ReferenceSelect {...props} field={field} list={field.references} />;
      break;
    case "choice":
      if (field.multiple) return <ValuesInput {...props} field={field} />;
      return (
        <SelectField
          control={form.control}
          name={name}
          label={field.label}
          options={choiceOptions(field.options, valueAt(form.formState.defaultValues, name)).map((value) => ({
            value,
            label: field.labels?.[field.options.indexOf(value)] ?? String(value),
          }))}
          emptyLabel={field.required ? undefined : noneLabel(field.options)}
          helperText={helperText}
          disabled={locked}
          onChange={props.onChoiceChange && ((value) => props.onChoiceChange?.(field.key, value))}
        />
      );
    case "text":
      if (field.multiple) return <ValuesInput {...props} field={field} />;
  }
  return (
    <FormTextField
      control={form.control}
      name={name}
      label={field.label}
      placeholder={"placeholder" in field ? field.placeholder : undefined}
      fullWidth
      helperText={helperText}
    />
  );
}

/** Where a declared field's value goes in its form: under its fields (a progression's, which only fields are). */
function fieldPath<T extends FieldValues>(key: string): FieldPath<T> {
  return formPath<T>(`fields.${key}`);
}

/** Fields in their grid, each where its width puts it, those whose condition the form doesn't meet left out. */
function FieldsGrid<T extends FieldValues>({ fields, ...props }: FieldsGridProps<T>) {
  // Its yes-or-no switches open it, together, before the fields one of them may reveal
  const switches = fields.filter(isSwitch);
  return (
    <Box sx={[FIELDS_GRID_SX, props.columns === 2 && TWO_COLUMNS_SX]}>
      {switches.length > 0 && (
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 1, sm: 3 }}
          sx={[WIDE_FIELD_SX, { flexWrap: "wrap" }]}
        >
          {switches.map((field) => (
            <GridField key={field.key} {...props} field={field} />
          ))}
        </Stack>
      )}
      {fields
        .filter((field) => !isSwitch(field))
        .map((field) => (
          <GridField key={field.key} {...props} field={field} />
        ))}
    </Box>
  );
}

/** A three-state flag, bound to its form's field: its select, handed the field's value, change and ref. */
function FlagField<T extends FieldValues>({ field, form, help, prefix }: FieldInputProps<T, FlagField>) {
  const { field: bound } = useController({ control: form.control, name: formPath<T>(`${prefix}${field.key}`) });
  const readOnly = useReadOnlyFields();
  return (
    <FlagSelect
      field={field}
      help={help}
      inputRef={bound.ref}
      onChange={bound.onChange}
      readOnly={readOnly}
      value={bound.value}
    />
  );
}

/**
 * A yes or no, or none: a three-state flag's select, which holds `true`, `false` or null. Read-only, its label above its
 * value, "—" for none.
 */
function FlagSelect({ field, help, inputRef, onChange, readOnly, value }: FlagSelectProps) {
  return (
    <TextField
      inputRef={inputRef}
      select
      fullWidth
      label={field.label}
      value={value === true ? "true" : value === false ? "false" : ""}
      onChange={(event) => onChange(event.target.value === "" ? null : event.target.value === "true")}
      helperText={help ? field.help : undefined}
      slotProps={{
        input: { readOnly },
        inputLabel: readOnly ? { shrink: true } : undefined,
        select: readOnly
          ? {
              displayEmpty: true,
              renderValue: (shown: unknown) =>
                FLAG_CHOICES.find((choice) => choice.value === shown)?.label ?? <EmptyValue />,
            }
          : undefined,
      }}
    >
      <MenuItem value="">None</MenuItem>
      {FLAG_CHOICES.map((choice) => (
        <MenuItem key={choice.value} value={choice.value}>
          {choice.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

/** A path of a form's values, which the fields' declarations name as text (`fields.weapon.type`, `type`). */
function formPath<T extends FieldValues>(path: string): FieldPath<T> {
  return path as FieldPath<T>;
}

/** A field in its grid, where its width puts it; on its conditions, while the form meets them. */
function GridField<T extends FieldValues>({ field, ...props }: FieldInputProps<T>) {
  if (field.shownWhen?.length)
    return <ShownField {...props} field={field} paths={field.shownWhen.map((condition) => condition.path)} />;
  return (
    <Box sx={[isWide(field) && WIDE_FIELD_SX]}>
      <FieldInput {...props} field={field} />
    </Box>
  );
}

/** Whether a field is a yes or no a switch shows: a two-state flag (a three-state one is a select). */
function isSwitch(field: EntityField) {
  return field.input === "flag" && !field.nullable;
}

/** Whether a field takes the grid's whole width: a group, several values, a progression, or a column's list. */
function isWide(field: EntityField) {
  return (
    isOneOf(field.input, ["aptitudeLevels", "grantedFeats", "group", "progression", "saveBases"]) ||
    ((field.input === "choice" || field.input === "text") && field.multiple)
  );
}

/** A field's label, with its unit when it has one ("Cost (gp)"). */
function labelOf(field: { label: string; unit?: string }) {
  return field.unit ? `${field.label} (${field.unit})` : field.label;
}

/**
 * A progression, under its label: its frequency (none at 0), then the levels it gives more at, each its level and how
 * many more (none to give for one that gives one at most a level), added and removed. A level listed twice, or giving
 * past its bound with its frequency's, says why under it. Read-only, its values, nothing to add or remove.
 */
function ProgressionInput<T extends FieldValues>({ field, form, help }: FieldInputProps<T, ProgressionField>) {
  const labelId = useId();
  const helpId = useId();
  const readOnly = useReadOnlyFields();
  const { control } = form;
  const {
    fields: rows,
    append,
    remove,
  } = useFieldArray({ control, name: `fields.${field.key}.extra` as ArrayPath<T> });
  const every: unknown = useWatch({ control, name: fieldPath<T>(`${field.key}.every`) });
  const watched: unknown = useWatch({ control, name: fieldPath<T>(`${field.key}.extra`) });
  const extra: ProgressionExtra[] = Array.isArray(watched) ? watched : [];
  // One at most a level: each listed level gives one, which its frequency mustn't give already
  const givesOne = field.max === 1;
  // A frequency the form holds whole, none otherwise: its own input says why
  const frequency = typeof every === "number" && Number.isInteger(every) ? every : 0;
  const roomAt = (level: number) => countRoomAt(frequency, level, field.max);
  // What's wrong with a row's part, with its value as typed: the save's own checks
  const issueAt = (index: number, part: "amount" | "level", value: number) => {
    const typed = extra.map((given, row) => (row === index ? { ...given, [part]: value } : given));
    const issue = findProgressionIssues({ every: frequency, extra: typed }, field.max).find(
      (found) => found.index === index && found.part === part,
    );
    return issue?.message ?? true;
  };
  // A level's checks read the other levels and the frequency: once a submit has shown them, they follow either
  const levelsListed = extra.map(({ level }) => level).join(",");
  const { isSubmitted } = form.formState;
  const { trigger } = form;
  const extraPath = fieldPath<T>(`${field.key}.extra`);
  useEffect(() => {
    if (isSubmitted) void trigger(extraPath);
  }, [every, extraPath, isSubmitted, levelsListed, trigger]);
  // The first level that may give more: unlisted, and short of its bound with its frequency's
  const nextLevel = Array.from({ length: field.levels }, (_, i) => i + 1).find(
    (level) => !extra.some((given) => given.level === level) && roomAt(level) > 0,
  );
  const described = help && field.help !== "";
  return (
    <Stack role="group" aria-labelledby={labelId} aria-describedby={described ? helpId : undefined} spacing={1}>
      <Box id={labelId}>
        <SubsectionTitle>{field.label}</SubsectionTitle>
      </Box>
      <Stack spacing={2}>
        <Box sx={PROGRESSION_WIDTH_SX}>
          <FormTextField
            control={control}
            name={fieldPath<T>(`${field.key}.every`)}
            rules={wholeNumberRules(0, "Frequency is required", field.levels)}
            number
            label="Every N Levels"
            helperText="0 for none"
            fullWidth
            slotProps={{ htmlInput: { min: 0, max: field.levels } }}
          />
        </Box>
        <Stack spacing={1.5}>
          <Typography variant="body2" component="p" sx={{ color: "text.secondary" }}>
            {givesOne ? "Also at Levels" : "More at Levels"}
          </Typography>
          {readOnly && rows.length === 0 && <EmptyValue />}
          {rows.map((row, index) => (
            <Box key={row.id} sx={[PROGRESSION_ROW_SX, PROGRESSION_WIDTH_SX]}>
              <FormTextField
                control={control}
                name={fieldPath<T>(`${field.key}.extra.${index}.level`)}
                rules={wholeNumberRules(1, "Level is required", field.levels, [
                  (level) => issueAt(index, "level", level),
                ])}
                number
                label="Level"
                fullWidth
                slotProps={{ htmlInput: { min: 1, max: field.levels } }}
              />
              {givesOne ? (
                <Box />
              ) : (
                <FormTextField
                  control={control}
                  name={fieldPath<T>(`${field.key}.extra.${index}.amount`)}
                  rules={wholeNumberRules(1, "Amount is required", field.max, [
                    (amount) => issueAt(index, "amount", amount),
                  ])}
                  number
                  label="Amount"
                  fullWidth
                  slotProps={{ htmlInput: { min: 1, max: field.max } }}
                />
              )}
              {!readOnly && (
                <Box sx={{ pt: 1 }}>
                  <RowAction
                    icon={DeleteIcon}
                    label={
                      Number.isInteger(extra[index]?.level) ? `Remove Level ${extra[index].level}` : "Remove Level"
                    }
                    intent="destructive"
                    onClick={() => remove(index)}
                  />
                </Box>
              )}
            </Box>
          ))}
          {!readOnly && (
            <AddButton
              variant="outlined"
              label="Add Level"
              // The form's type is its owner's, which a path its declarations name can't narrow to a level's row
              onClick={() => nextLevel !== undefined && append({ amount: 1, level: nextLevel } as never)}
              disabled={nextLevel === undefined}
              sx={{ alignSelf: "flex-start" }}
            />
          )}
        </Stack>
        {described && <FormHelperText id={helpId}>{field.help}</FormHelperText>}
      </Stack>
    </Stack>
  );
}

/** An entity of the ruleset, by its id: a select of the list its kind names (`list`), none too unless it's required. */
function ReferenceSelect<T extends FieldValues>({
  field,
  form,
  help,
  prefix,
  rulesetId,
  list,
}: ReferenceSelectProps<T>) {
  const { data: entities, error } = useQuery(rulesetOptionsQuery(list, rulesetId));
  return (
    <SelectField
      control={form.control}
      name={formPath<T>(`${prefix}${field.key}`)}
      label={field.label}
      rules={field.required ? requiredRules(`${field.label} is required`) : undefined}
      options={(entities ?? []).map((entity) => ({ value: entity.id, label: entity.name }))}
      emptyLabel={field.required ? undefined : "None"}
      loadError={error}
      helperText={help ? field.help : undefined}
    />
  );
}

/** A field shown on its conditions: while the form's values at their `paths` are ones it shows for. */
function ShownField<T extends FieldValues>({ paths, ...props }: ShownFieldProps<T>) {
  const watched: unknown[] = useWatch({ control: props.form.control, name: paths.map((path) => formPath<T>(path)) });
  if (!isFieldShown(props.field, watched)) return null;
  return (
    <Box sx={[isWide(props.field) && WIDE_FIELD_SX]}>
      <FieldInput {...props} />
    </Box>
  );
}

/** Several values, as chips: a closed list's options (and those the saved form holds), or free ones. */
function ValuesInput<T extends FieldValues>({ field, form, help, prefix }: FieldInputProps<T, ValuesField>) {
  const name = formPath<T>(`${prefix}${field.key}`);
  const readOnly = useReadOnlyFields();
  const {
    field: { ref, value, onChange, ...bound },
  } = useController({ control: form.control, name });
  const saved = valueAt(form.formState.defaultValues, name);
  const values: string[] = Array.isArray(value) ? value : [];
  // Read-only, "—" for none, nothing beside its chips; an example of a free one otherwise
  const placeholder = readOnly
    ? (values.length === 0 && EMPTY_VALUE_TEXT) || undefined
    : (field.input === "text" && field.placeholder) || undefined;
  return (
    <Autocomplete
      {...bound}
      multiple
      freeSolo={field.input === "text"}
      readOnly={readOnly}
      options={field.input === "choice" ? choiceOptions(field.options, saved) : []}
      value={values}
      onChange={(_, next) => onChange(next)}
      renderValue={(selected, getItemProps) =>
        selected.map((option, index) => {
          const { key, ...chipProps } = getItemProps({ index });
          return <ValueChip color="default" key={key} label={option} {...chipProps} />;
        })
      }
      renderInput={(params) => (
        <TextField
          {...params}
          inputRef={ref}
          label={field.label}
          helperText={help ? field.help : undefined}
          placeholder={placeholder}
          slotProps={readOnly ? { ...params.slotProps, inputLabel: { shrink: true } } : params.slotProps}
        />
      )}
    />
  );
}

/**
 * An entity's columns, as its rules describe them (`columns`: its form's own, beside its name and description), bound
 * where each goes in the form itself: its plain values (`placement` "before", the form's fields' place: a hit die, a
 * cost, a type), or its lists of links (`after`, below the fields: a spell's aptitudes, a level's saves and feats),
 * each as `EntityFields` lays a field out, reading what it needs of the entity (`context`).
 */
export function EntityColumns<T extends FieldValues>({
  columns,
  context = NO_CONTEXT,
  form,
  placement,
  rulesetId,
}: EntityColumnsProps<T>) {
  const { onChoiceChange } = useTemplateReset(form, rulesetId, columns, context);
  const placed = columns.filter((column) => isOneOf(column.input, LINK_INPUTS) === (placement === "after"));
  if (placed.length === 0) return null;
  return (
    <FieldsGrid
      columns={1}
      context={context}
      fields={placed}
      form={form}
      help={false}
      onChoiceChange={onChoiceChange}
      prefix=""
      rulesetId={rulesetId}
    />
  );
}

/**
 * An entity's fields, as its ruleset declares them (`useEntityFields`): each its input, one a row (two side by side,
 * `columns`), a group's under its label, a field on a condition while the form meets it, read-only under
 * `ReadOnlyFields`. Bound to the form's `fields`, which its save sends as they are.
 */
export function EntityFields<T extends FieldValues>({
  columns = 1,
  entityType,
  form,
  help = false,
  rulesetId,
}: EntityFieldsProps<T>) {
  const { fields, error } = useEntityFields(rulesetId, entityType);
  if (!fields) return error ? <LoadError what="Fields" error={error} /> : <DiceSpinner sx={{ py: 4 }} />;
  if (fields.length === 0) return null;
  return (
    <FieldsGrid
      columns={columns}
      context={NO_CONTEXT}
      fields={fields}
      form={form}
      help={help}
      prefix="fields."
      rulesetId={rulesetId}
    />
  );
}
