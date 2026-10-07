import { Autocomplete, Stack, TextField, Typography } from "@mui/material";
import { Controller, useController, type UseFormReturn } from "react-hook-form";

import {
  DescriptionField,
  FormTextField,
  NameField,
  SelectField,
  SubsectionTitle,
  ValueChip,
} from "@/client/src/components/common/index.ts";
import { APTITUDES_RULES, NAME_RULES, readNumberInput } from "@/client/src/lib/validation.ts";
import { AptitudesAutocomplete } from "@/client/src/pages/rulesets/components/AptitudesAutocomplete.tsx";
import { byName, useAptitudeLookup } from "@/client/src/pages/rulesets/components/useAptitudeLookup.ts";
import type { Aptitude } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import type { RulesetSave } from "@/client/src/pages/rulesets/hooks/index.ts";
import {
  MAX_SPELL_LEVEL,
  SPELL_COMPONENTS,
  SPELL_DESCRIPTORS,
  SPELL_RANGE_TYPES,
  SPELL_RESISTANCE_OPTIONS,
  SPELL_SCHOOLS,
  SPELL_SUBSCHOOLS,
} from "@/shared/dnd3.5/spells.ts";

import {
  areSpellLevelsValid,
  spellAptitude,
  type SpellAptitude,
  type SpellFormData,
  spellLevelError,
} from "./spellForm.ts";

interface SpellFormFieldsProps {
  /** A new spell needs an aptitude; an existing one may lose its own. */
  aptitudesRequired?: boolean;
  form: UseFormReturn<SpellFormData>;
  hideProperties?: boolean;
  /** Aptitudes the form may already hold (the spell's own), so they show by name. */
  knownAptitudes?: Aptitude[];
  rulesetId: string;
  saves: RulesetSave[];
  /** Why the saves didn't load. */
  savesError: unknown;
}

interface SpellPropertyFieldsProps {
  form: UseFormReturn<SpellFormData>;
}

interface TagsFieldProps {
  form: UseFormReturn<SpellFormData>;
  label: string;
  name: "descriptors" | "components";
  options: readonly string[];
}

function SpellPropertyFields({ form }: SpellPropertyFieldsProps) {
  return (
    <>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <SelectField control={form.control} name="school" label="School" options={SPELL_SCHOOLS} emptyLabel="None" />
        <SelectField
          control={form.control}
          name="subschool"
          label="Subschool"
          options={SPELL_SUBSCHOOLS}
          emptyLabel="None"
        />
      </Stack>
      <TagsField form={form} name="descriptors" label="Descriptors" options={SPELL_DESCRIPTORS} />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <FormTextField
          control={form.control}
          name="castingTime"
          label="Casting Time"
          fullWidth
          placeholder='e.g., "1 standard action"'
        />
        <SelectField
          control={form.control}
          name="rangeType"
          label="Range"
          options={SPELL_RANGE_TYPES}
          emptyLabel="None"
        />
      </Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <FormTextField
          control={form.control}
          name="target"
          label="Target"
          fullWidth
          placeholder='e.g., "One creature"'
        />
        <FormTextField
          control={form.control}
          name="areaOfEffect"
          label="Area of Effect"
          fullWidth
          placeholder='e.g., "20-ft. radius"'
        />
      </Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <FormTextField
          control={form.control}
          name="duration"
          label="Duration"
          fullWidth
          placeholder='e.g., "1 round/level"'
        />
        <SelectField
          control={form.control}
          name="spellResistance"
          label="Spell Resistance"
          options={SPELL_RESISTANCE_OPTIONS}
          emptyLabel="None"
        />
      </Stack>
      <TagsField form={form} name="components" label="Components" options={SPELL_COMPONENTS} />
    </>
  );
}

/** A free-text list with suggestions, shown as chips. */
function TagsField({ form, name, label, options }: TagsFieldProps) {
  return (
    <Controller
      name={name}
      control={form.control}
      render={({ field }) => (
        <Autocomplete
          multiple
          freeSolo
          options={options}
          value={field.value ?? []}
          onChange={(_, newValue) => field.onChange(newValue)}
          renderValue={(value, getItemProps) =>
            value.map((option, index) => {
              const { key, ...tagProps } = getItemProps({ index });
              return <ValueChip color="default" key={key} label={option} {...tagProps} />;
            })
          }
          renderInput={(params) => <TextField {...params} label={label} />}
        />
      )}
    />
  );
}

export function SpellFormFields({
  form,
  rulesetId,
  saves,
  savesError,
  hideProperties,
  knownAptitudes = [],
  aptitudesRequired = false,
}: SpellFormFieldsProps) {
  // Aptitudes and their levels live in the form, sorted by aptitude name.
  const aptitudes = useAptitudeLookup(knownAptitudes);
  const { field, fieldState } = useController({
    control: form.control,
    name: "aptitudes",
    rules: { ...(aptitudesRequired && APTITUDES_RULES), validate: areSpellLevelsValid },
  });
  // An empty list is the list's error; a level's is its input's
  const levelsInvalid = fieldState.error?.type === "validate";
  const selected = field.value ?? [];
  const selectedAptitudes = aptitudes.resolve(selected.map((a) => a.id));
  const setSelected = (next: SpellAptitude[]) => field.onChange(next);
  const levelOf = (id: string) => selected.find((a) => a.id === id)?.level;

  return (
    <>
      <NameField control={form.control} name="name" rules={NAME_RULES} />
      <DescriptionField control={form.control} name="description" />
      <SelectField
        control={form.control}
        name="saveId"
        label="Saving Throw"
        emptyLabel="None"
        options={saves.map((save) => ({ value: save.id, label: save.name }))}
        loadError={savesError}
      />
      <FormTextField
        control={form.control}
        name="saveEffect"
        label="Save Effect"
        fullWidth
        placeholder='e.g., "negates", "half", "partial"'
      />
      {!hideProperties && <SpellPropertyFields form={form} />}
      <AptitudesAutocomplete
        rulesetId={rulesetId}
        inputRef={field.ref}
        error={levelsInvalid ? undefined : fieldState.error}
        value={selectedAptitudes}
        onChange={(next) => {
          aptitudes.remember(next);
          setSelected([...next].sort(byName).map((a) => spellAptitude(a.id, levelOf(a.id))));
        }}
      />
      {selectedAptitudes.length > 0 && (
        <Stack spacing={1}>
          <SubsectionTitle>Aptitude Settings</SubsectionTitle>
          {selectedAptitudes.map((apt) => (
            <Stack key={apt.id} direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                {apt.name}
              </Typography>
              <TextField
                label="Level"
                type="number"
                size="small"
                slotProps={{ htmlInput: { min: 0, max: MAX_SPELL_LEVEL } }}
                value={levelOf(apt.id) ?? ""}
                error={levelsInvalid && spellLevelError(levelOf(apt.id)) !== undefined}
                helperText={levelsInvalid && spellLevelError(levelOf(apt.id))}
                onChange={(e) => {
                  const level = readNumberInput(e.target.value);
                  setSelected(selected.map((a) => (a.id === apt.id ? spellAptitude(a.id, level) : a)));
                }}
                sx={{ width: 80 }}
              />
            </Stack>
          ))}
        </Stack>
      )}
    </>
  );
}
