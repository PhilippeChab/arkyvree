import { Box, TextField } from "@mui/material";
import { type FieldValues, useController } from "react-hook-form";

import { LoadError, useReadOnlyFields } from "@/client/src/components/common/index.ts";
import { readNumberInput, wholeNumberError } from "@/client/src/lib/validation.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { useRulesetSaves } from "@/client/src/pages/rulesets/hooks/index.ts";

import type { ColumnInputProps } from "./columnContext.ts";

/** A save's base bonus at a level, as the form holds it. */
interface SaveBase {
  base: number;
  saveId: string;
}

/** A base bonus a class level gives each of the ruleset's saves. */
type SaveBasesField = Extract<EntityField, { input: "saveBases" }>;

/**
 * A class level's base bonus to each of the ruleset's saves, side by side (three a row at most), each from the field's
 * `min` to its `max`, 0 unset; one out of bounds says why under its own input. Read-only under `ReadOnlyFields`.
 */
export function SaveBasesInput<T extends FieldValues>({
  field,
  form,
  name,
  rulesetId,
}: ColumnInputProps<T, SaveBasesField>) {
  const baseError = (base: number) => wholeNumberError(base, field.min, field.max);
  const { data: rulesetSaves, error: savesError } = useRulesetSaves(rulesetId);
  const { field: bound, fieldState } = useController({
    control: form.control,
    name,
    rules: { validate: (value: SaveBase[] | undefined) => (value ?? []).every(({ base }) => !baseError(base)) },
  });
  const saves: SaveBase[] = Array.isArray(bound.value) ? bound.value : [];
  const invalid = !!fieldState.error;
  const readOnly = useReadOnlyFields();
  const saveList = rulesetSaves ?? [];
  const baseFor = (saveId: string) => saves.find((save) => save.saveId === saveId)?.base ?? 0;

  // Update in place, so changing a value back leaves the form clean.
  const setBase = (saveId: string, base: number) =>
    bound.onChange(
      saves.some((save) => save.saveId === saveId)
        ? saves.map((save) => (save.saveId === saveId ? { saveId, base } : save))
        : [...saves, { saveId, base }],
    );

  if (!!savesError && saveList.length === 0) return <LoadError what="Saves" error={savesError} />;
  if (saveList.length === 0) return null;
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: `repeat(${Math.min(saveList.length, 3)}, 1fr)` },
        gap: 2,
      }}
    >
      {saveList.map((save, index) => (
        <TextField
          key={save.id}
          // The saves' one field: a failed submit focuses its first input
          inputRef={index === 0 ? bound.ref : undefined}
          label={`${save.name} Save`}
          type="number"
          value={baseFor(save.id)}
          onChange={(event) => setBase(save.id, readNumberInput(event.target.value) ?? 0)}
          error={invalid && baseError(baseFor(save.id)) !== undefined}
          helperText={invalid && baseError(baseFor(save.id))}
          slotProps={{
            htmlInput: { min: field.min, max: field.max },
            input: { readOnly },
            inputLabel: readOnly ? { shrink: true } : undefined,
          }}
        />
      ))}
    </Box>
  );
}
