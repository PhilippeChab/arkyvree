import { Stack, TextField, Typography } from "@mui/material";
import { type FieldValues, useController } from "react-hook-form";

import { EMPTY_VALUE_TEXT, SubsectionTitle, useReadOnlyFields } from "@/client/src/components/common/index.ts";
import { APTITUDES_RULES, readNumberInput, wholeNumberError } from "@/client/src/lib/validation.ts";
import { AptitudesAutocomplete } from "@/client/src/pages/rulesets/components/AptitudesAutocomplete.tsx";
import { byName } from "@/client/src/pages/rulesets/components/byName.ts";
import { useAptitudeLookup } from "@/client/src/pages/rulesets/components/useAptitudeLookup.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";

import type { ColumnInputProps } from "./columnContext.ts";

/** An aptitude and its level, as the form holds it: no `level` key for none, so clearing one leaves the form clean. */
interface AptitudeLevel {
  id: string;
  level?: number;
}

/** A pool's links, each with a level of its own. */
type AptitudeLevelsField = Extract<EntityField, { input: "aptitudeLevels" }>;

/** An aptitude and its level, none without one. */
function aptitudeLevel(id: string, level: number | null | undefined): AptitudeLevel {
  return level == null ? { id } : { id, level };
}

/**
 * A pool's links (a spell's spell lists): its aptitudes, picked by name and kept sorted by it, then each one's level,
 * from the field's `min` to its `max`, none too (a level out of bounds says why under its input). A new entity needs
 * one when it's `required`. Read-only, "—" for a level it has none of.
 */
export function AptitudeLevelsInput<T extends FieldValues>({
  context,
  field,
  form,
  name,
  rulesetId,
}: ColumnInputProps<T, AptitudeLevelsField>) {
  const levelError = (level: number | undefined) =>
    level === undefined ? undefined : wholeNumberError(level, field.min, field.max);
  const aptitudes = useAptitudeLookup(context.knownAptitudes ?? []);
  const { field: bound, fieldState } = useController({
    control: form.control,
    name,
    rules: {
      ...(field.required && context.newEntity && APTITUDES_RULES),
      validate: (value: AptitudeLevel[] | undefined) =>
        (value ?? []).every((aptitude) => levelError(aptitude.level) === undefined),
    },
  });
  // An empty list is the list's error; a level's is its input's
  const levelsInvalid = fieldState.error?.type === "validate";
  const selected: AptitudeLevel[] = Array.isArray(bound.value) ? bound.value : [];
  const selectedAptitudes = aptitudes.resolve(selected.map((aptitude) => aptitude.id));
  const levelOf = (id: string) => selected.find((aptitude) => aptitude.id === id)?.level;
  const readOnly = useReadOnlyFields();

  return (
    <Stack spacing={3}>
      <AptitudesAutocomplete
        rulesetId={rulesetId}
        inputRef={bound.ref}
        error={levelsInvalid ? undefined : fieldState.error}
        value={selectedAptitudes}
        onChange={(next) => {
          aptitudes.remember(next);
          bound.onChange([...next].sort(byName).map((aptitude) => aptitudeLevel(aptitude.id, levelOf(aptitude.id))));
        }}
      />
      {selectedAptitudes.length > 0 && (
        <Stack spacing={1}>
          <SubsectionTitle>Aptitude Settings</SubsectionTitle>
          {selectedAptitudes.map((aptitude) => (
            <Stack key={aptitude.id} direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                {aptitude.name}
              </Typography>
              <TextField
                label="Level"
                type="number"
                size="small"
                // Read-only, "—" for none
                placeholder={readOnly ? EMPTY_VALUE_TEXT : undefined}
                slotProps={{
                  htmlInput: { min: field.min, max: field.max },
                  input: { readOnly },
                  inputLabel: readOnly ? { shrink: true } : undefined,
                }}
                value={levelOf(aptitude.id) ?? ""}
                error={levelsInvalid && levelError(levelOf(aptitude.id)) !== undefined}
                helperText={levelsInvalid && levelError(levelOf(aptitude.id))}
                onChange={(event) => {
                  const level = readNumberInput(event.target.value);
                  bound.onChange(
                    selected.map((held) => (held.id === aptitude.id ? aptitudeLevel(held.id, level) : held)),
                  );
                }}
                sx={{ width: 80 }}
              />
            </Stack>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
