import { Autocomplete, Box, MenuItem, Stack, TextField } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import type { Ref } from "react";
import { type FieldPath, type FieldValues, useController, type UseFormReturn, useWatch } from "react-hook-form";

import {
  DiceSpinner,
  FormTextField,
  LoadError,
  SelectField,
  SubsectionTitle,
  SwitchField,
  useReadOnlyFields,
  ValueChip,
} from "@/client/src/components/common/index.ts";
import { rulesetOptionsQuery } from "@/client/src/lib/queries.ts";
import { requiredRules, wholeNumberRules } from "@/client/src/lib/validation.ts";
import type { EntityField, RulesetFields } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { useEntityFields } from "@/client/src/pages/rulesets/hooks/index.ts";
import { isOneOf } from "@/shared/isOneOf.ts";

import { choiceOptions, isFieldShown, noneLabel, valueAt } from "./entityFields.ts";

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

/** What every field of a form shares: the form, how its fields show, and the ruleset whose entities they name. */
interface FieldsShowing<T extends FieldValues> {
  columns: 1 | 2;
  form: UseFormReturn<T>;
  help: boolean;
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

/** What a field shown on its condition takes: the path of the form's value its condition reads. */
interface ShownFieldProps<T extends FieldValues> extends FieldInputProps<T> {
  path: string;
}

/** A yes or no. */
type FlagField = Extract<EntityField, { input: "flag" }>;

/** A field that names an entity of the ruleset. */
type RefField = Extract<EntityField, { input: "ref" }>;

/** A field that holds a choice or a text, one or several. */
type ValuesField = Extract<EntityField, { input: "choice" | "text" }>;

/** A grid of fields: a column, 24px between its rows. */
const FIELDS_GRID_SX = { display: "grid", gridTemplateColumns: "1fr", columnGap: 2, rowGap: 3 };

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
  const name = fieldPath<T>(field.key);
  const helperText = help ? field.help : undefined;
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
          rules={wholeNumberRules(
            field.min,
            field.default === null ? undefined : `${field.label} is required`,
            field.max,
          )}
          number
          label={field.label}
          fullWidth
          helperText={helperText}
          slotProps={{ htmlInput: { min: field.min, max: field.max } }}
        />
      );
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
          options={choiceOptions(field.options, valueAt(form.formState.defaultValues, name))}
          emptyLabel={noneLabel(field.options)}
          helperText={helperText}
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

/** Where a field's value goes in its form: under its fields. */
function fieldPath<T extends FieldValues>(key: string): FieldPath<T> {
  return formPath<T>(`fields.${key}`);
}

/** Fields in their grid, each where its width puts it, those whose condition the form doesn't meet left out. */
function FieldsGrid<T extends FieldValues>({ fields, ...props }: FieldsGridProps<T>) {
  return (
    <Box sx={[FIELDS_GRID_SX, props.columns === 2 && TWO_COLUMNS_SX]}>
      {fields.map((field) =>
        field.shownWhen ? (
          <ShownField key={field.key} {...props} field={field} path={field.shownWhen.path} />
        ) : (
          <Box key={field.key} sx={[isWide(field) && WIDE_FIELD_SX]}>
            <FieldInput {...props} field={field} />
          </Box>
        ),
      )}
    </Box>
  );
}

/** A three-state flag, bound to its form's field: its select, handed the field's value, change and ref. */
function FlagField<T extends FieldValues>({ field, form, help }: FieldInputProps<T, FlagField>) {
  const { field: bound } = useController({ control: form.control, name: fieldPath<T>(field.key) });
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

/** A yes or no, or none: a three-state flag's select, which holds `true`, `false` or null. */
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
      slotProps={{ input: { readOnly } }}
    >
      <MenuItem value="">None</MenuItem>
      <MenuItem value="true">Yes</MenuItem>
      <MenuItem value="false">No</MenuItem>
    </TextField>
  );
}

/** A path of a form's values, which the fields' declarations name as text (`fields.weapon.type`, `type`). */
function formPath<T extends FieldValues>(path: string): FieldPath<T> {
  return path as FieldPath<T>;
}

/** Whether a field takes the grid's whole width: a group, or several values. */
function isWide(field: EntityField) {
  return field.input === "group" || ((field.input === "choice" || field.input === "text") && field.multiple);
}

/** An entity of the ruleset, by its id: a select of the list its kind names (`list`), none too unless it's required. */
function ReferenceSelect<T extends FieldValues>({ field, form, help, rulesetId, list }: ReferenceSelectProps<T>) {
  const { data: entities, error } = useQuery(rulesetOptionsQuery(list, rulesetId));
  return (
    <SelectField
      control={form.control}
      name={fieldPath<T>(field.key)}
      label={field.label}
      rules={field.required ? requiredRules(`${field.label} is required`) : undefined}
      options={(entities ?? []).map((entity) => ({ value: entity.id, label: entity.name }))}
      emptyLabel={field.required ? undefined : "None"}
      loadError={error}
      helperText={help ? field.help : undefined}
    />
  );
}

/** A field shown on its condition: while the form's value at its condition's `path` is one it shows for. */
function ShownField<T extends FieldValues>({ path, ...props }: ShownFieldProps<T>) {
  const watched = useWatch({ control: props.form.control, name: formPath<T>(path) });
  if (!isFieldShown(props.field, watched)) return null;
  return (
    <Box sx={[isWide(props.field) && WIDE_FIELD_SX]}>
      <FieldInput {...props} />
    </Box>
  );
}

/** Several values, as chips: a closed list's options (and those the saved form holds), or free ones. */
function ValuesInput<T extends FieldValues>({ field, form, help }: FieldInputProps<T, ValuesField>) {
  const name = fieldPath<T>(field.key);
  const readOnly = useReadOnlyFields();
  const {
    field: { ref, value, onChange, ...bound },
  } = useController({ control: form.control, name });
  const saved = valueAt(form.formState.defaultValues, name);
  const values: string[] = Array.isArray(value) ? value : [];
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
          placeholder={field.input === "text" ? field.placeholder : undefined}
        />
      )}
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
  return <FieldsGrid columns={columns} fields={fields} form={form} help={help} rulesetId={rulesetId} />;
}
