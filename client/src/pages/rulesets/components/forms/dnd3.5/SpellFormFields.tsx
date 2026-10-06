import { Autocomplete, Box, Chip, MenuItem, TextField, Typography } from "@mui/material";
import { Controller, useController, type UseFormReturn } from "react-hook-form";

import { DescriptionField, FormTextField, NameField, SelectField } from "@/client/src/components/common/index.ts";
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

function SpellPropertyFields({ form }: { form: UseFormReturn<SpellFormData> }) {
  return (
    <>
      <Box sx={{ display: "flex", gap: 2, flexDirection: { xs: "column", sm: "row" } }}>
        <Controller
          name="school"
          control={form.control}
          render={({ field }) => (
            <TextField {...field} value={field.value ?? ""} label="School" fullWidth select>
              <MenuItem value="">None</MenuItem>
              {SPELL_SCHOOLS.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
        <Controller
          name="subschool"
          control={form.control}
          render={({ field }) => (
            <TextField {...field} value={field.value ?? ""} label="Subschool" fullWidth select>
              <MenuItem value="">None</MenuItem>
              {SPELL_SUBSCHOOLS.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
      </Box>
      <TagsField form={form} name="descriptors" label="Descriptors" options={SPELL_DESCRIPTORS} />
      <Box sx={{ display: "flex", gap: 2, flexDirection: { xs: "column", sm: "row" } }}>
        <FormTextField
          control={form.control}
          name="castingTime"
          label="Casting Time"
          fullWidth
          placeholder='e.g., "1 standard action"'
        />
        <Controller
          name="rangeType"
          control={form.control}
          render={({ field }) => (
            <TextField {...field} value={field.value ?? ""} label="Range" fullWidth select>
              <MenuItem value="">None</MenuItem>
              {SPELL_RANGE_TYPES.map((r) => (
                <MenuItem key={r} value={r}>
                  {r}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
      </Box>
      <Box sx={{ display: "flex", gap: 2, flexDirection: { xs: "column", sm: "row" } }}>
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
      </Box>
      <Box sx={{ display: "flex", gap: 2, flexDirection: { xs: "column", sm: "row" } }}>
        <FormTextField
          control={form.control}
          name="duration"
          label="Duration"
          fullWidth
          placeholder='e.g., "1 round/level"'
        />
        <Controller
          name="spellResistance"
          control={form.control}
          render={({ field }) => (
            <TextField {...field} value={field.value ?? ""} label="Spell Resistance" fullWidth select>
              <MenuItem value="">None</MenuItem>
              {SPELL_RESISTANCE_OPTIONS.map((sr) => (
                <MenuItem key={sr} value={sr}>
                  {sr}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
      </Box>
      <TagsField form={form} name="components" label="Components" options={SPELL_COMPONENTS} />
    </>
  );
}

/** A free-text list with suggestions, shown as chips. */
function TagsField({
  form,
  name,
  label,
  options,
}: {
  form: UseFormReturn<SpellFormData>;
  name: "descriptors" | "components";
  label: string;
  options: readonly string[];
}) {
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
        emptyLabel="None"
        options={saves.map((save) => ({ value: save.id, label: save.name }))}
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
        value={selectedAptitudes}
        onChange={(next) => {
          aptitudes.remember(next);
          setSelected([...next].sort(byName).map((a) => spellAptitude(a.id, levelOf(a.id))));
        }}
      />
      {selectedAptitudes.length > 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Typography variant="subtitle2" sx={{ color: "text.secondary" }}>
            Aptitude Settings
          </Typography>
          {selectedAptitudes.map((apt) => {
            return (
              <Box key={apt.id} sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
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
                    const level = e.target.value === "" ? undefined : parseInt(e.target.value);
                    setSelected(selected.map((a) => (a.id === apt.id ? spellAptitude(a.id, level) : a)));
                  }}
                  sx={{ width: 80 }}
                />
              </Box>
            );
          })}
        </Box>
      )}
    </>
  );
}
