import { Autocomplete, Chip, Stack, TextField, Typography } from "@mui/material";
import { Controller, useController, type UseFormReturn } from "react-hook-form";

import {
  DescriptionField,
  FieldRow,
  FormTextField,
  NameField,
  SelectField,
} from "@/client/src/components/common/index.ts";
import { type Aptitude, AptitudesAutocomplete } from "@/client/src/components/customization/index.ts";
import type { RulesetSave } from "@/client/src/hooks/index.ts";
import { nameRules } from "@/client/src/lib/validation.ts";
import { byName, useAptitudeLookup } from "@/client/src/pages/rulesets/components/forms/aptitudeLookup.ts";
import {
  SPELL_COMPONENTS,
  SPELL_DESCRIPTORS,
  SPELL_RANGE_TYPES,
  SPELL_RESISTANCE_OPTIONS,
  SPELL_SCHOOLS,
  SPELL_SUBSCHOOLS,
} from "@/shared/dnd3.5/spells.ts";

import { spellAptitude, type SpellAptitude, type SpellFormData } from "./spellForm.ts";

type Save = RulesetSave;

interface SpellFormFieldsProps {
  form: UseFormReturn<SpellFormData>;
  rulesetId: string;
  saves: Save[];
  hideProperties?: boolean;
  /** Aptitudes the form may already hold (the spell's own), so they show by name. */
  knownAptitudes?: Aptitude[];
}

interface SpellPropertyFieldsProps {
  form: UseFormReturn<SpellFormData>;
}

interface TagsFieldProps {
  form: UseFormReturn<SpellFormData>;
  name: "descriptors" | "components";
  label: string;
  options: readonly string[];
}

function SpellPropertyFields({ form }: SpellPropertyFieldsProps) {
  return (
    <>
      <FieldRow>
        <SelectField control={form.control} name="school" label="School" none="" options={SPELL_SCHOOLS} />
        <SelectField control={form.control} name="subschool" label="Subschool" none="" options={SPELL_SUBSCHOOLS} />
      </FieldRow>
      <TagsField form={form} name="descriptors" label="Descriptors" options={SPELL_DESCRIPTORS} />
      <FieldRow>
        <FormTextField
          control={form.control}
          name="castingTime"
          label="Casting Time"
          placeholder='e.g., "1 standard action"'
        />
        <SelectField control={form.control} name="rangeType" label="Range" none="" options={SPELL_RANGE_TYPES} />
      </FieldRow>
      <FieldRow>
        <FormTextField control={form.control} name="target" label="Target" placeholder='e.g., "One creature"' />
        <FormTextField
          control={form.control}
          name="areaOfEffect"
          label="Area of Effect"
          placeholder='e.g., "20-ft. radius"'
        />
      </FieldRow>
      <FieldRow>
        <FormTextField control={form.control} name="duration" label="Duration" placeholder='e.g., "1 round/level"' />
        <SelectField
          control={form.control}
          name="spellResistance"
          label="Spell Resistance"
          none=""
          options={SPELL_RESISTANCE_OPTIONS}
        />
      </FieldRow>
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
              return <Chip key={key} label={option} size="small" {...tagProps} />;
            })
          }
          renderInput={(params) => <TextField {...params} label={label} />}
        />
      )}
    />
  );
}

export function SpellFormFields({ form, rulesetId, saves, hideProperties, knownAptitudes = [] }: SpellFormFieldsProps) {
  // Aptitudes and their levels live in the form, sorted by aptitude name.
  const aptitudes = useAptitudeLookup(knownAptitudes);
  const { field } = useController({ control: form.control, name: "aptitudes" });
  const selected = field.value ?? [];
  const selectedAptitudes = aptitudes.resolve(selected.map((a) => a.id));
  const setSelected = (next: SpellAptitude[]) => field.onChange(next);
  const levelOf = (id: string) => selected.find((a) => a.id === id)?.level;

  return (
    <>
      <NameField control={form.control} name="name" rules={nameRules} />
      <DescriptionField control={form.control} name="description" />
      <SelectField
        control={form.control}
        name="saveId"
        label="Saving Throw"
        none={null}
        options={saves.map((save) => ({ value: save.id, label: save.name }))}
      />
      <FormTextField
        control={form.control}
        name="saveEffect"
        label="Save Effect"
        placeholder='e.g., "negates", "half", "partial"'
      />
      {!hideProperties && <SpellPropertyFields form={form} />}
      <AptitudesAutocomplete
        rulesetId={rulesetId}
        value={selectedAptitudes}
        onChange={(next) => {
          aptitudes.remember(next);
          setSelected([...next].sort(byName).map((a) => spellAptitude(a.id, levelOf(a.id))));
        }}
      />
      {selectedAptitudes.length > 0 && (
        <Stack spacing={1.5}>
          <Typography component="h3" variant="subtitle2" sx={{ color: "text.secondary" }}>
            Aptitude Settings
          </Typography>
          {selectedAptitudes.map((apt) => {
            return (
              <Stack key={apt.id} direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                  {apt.name}
                </Typography>
                <TextField
                  label="Level"
                  type="number"
                  size="small"
                  slotProps={{ htmlInput: { min: 0, max: 9 } }}
                  value={levelOf(apt.id) ?? ""}
                  onChange={(e) => {
                    const level =
                      e.target.value === "" ? undefined : Math.max(0, Math.min(parseInt(e.target.value), 9));
                    setSelected(selected.map((a) => (a.id === apt.id ? spellAptitude(a.id, level) : a)));
                  }}
                  sx={{ width: 80 }}
                />
              </Stack>
            );
          })}
        </Stack>
      )}
    </>
  );
}
