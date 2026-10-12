import { Stack, TextField, Typography } from "@mui/material";
import { useController, type UseFormReturn } from "react-hook-form";

import {
  DescriptionField,
  EMPTY_VALUE_TEXT,
  FormTextField,
  NameField,
  SelectField,
  SubsectionTitle,
  useReadOnlyFields,
} from "@/client/src/components/common/index.ts";
import { APTITUDES_RULES, readNumberInput } from "@/client/src/lib/validation.ts";
import { AptitudesAutocomplete } from "@/client/src/pages/rulesets/components/AptitudesAutocomplete.tsx";
import { byName } from "@/client/src/pages/rulesets/components/byName.ts";
import { EntityFields } from "@/client/src/pages/rulesets/components/forms/EntityFields.tsx";
import { useAptitudeLookup } from "@/client/src/pages/rulesets/components/useAptitudeLookup.ts";
import type { Aptitude } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import type { Save } from "@/client/src/pages/rulesets/hooks/index.ts";
import { MAX_SPELL_LEVEL } from "@/vocabulary/dnd3.5/spells.ts";

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
  /** Aptitudes the form may already hold (the spell's own), so they show by name. */
  knownAptitudes?: Aptitude[];
  rulesetId: string;
  saves: Save[];
  /** Why the saves didn't load. */
  savesError: unknown;
}

export function SpellFormFields({
  form,
  rulesetId,
  saves,
  savesError,
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
  const readOnly = useReadOnlyFields();

  return (
    <>
      <NameField control={form.control} name="name" />
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
      <EntityFields form={form} entityType="powers" rulesetId={rulesetId} columns={2} />
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
                // Read-only, "—" for none
                placeholder={readOnly ? EMPTY_VALUE_TEXT : undefined}
                slotProps={{
                  htmlInput: { min: 0, max: MAX_SPELL_LEVEL },
                  input: { readOnly },
                  inputLabel: readOnly ? { shrink: true } : undefined,
                }}
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
