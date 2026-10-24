import { Stack, TextField, Typography } from "@mui/material";
import { type FieldValues, useController } from "react-hook-form";

import { EMPTY_VALUE_TEXT, SubsectionTitle, useReadOnlyFields } from "@/client/src/components/common/index.ts";
import { useRulesetRules } from "@/client/src/hooks/index.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import { readNumberInput, requiredRules, wholeNumberError } from "@/client/src/lib/validation.ts";
import { byName } from "@/client/src/pages/rulesets/components/byName.ts";
import { EntitiesAutocomplete } from "@/client/src/pages/rulesets/components/EntitiesAutocomplete.tsx";
import { useEntityLookup } from "@/client/src/pages/rulesets/components/useEntityLookup.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";

import type { ColumnInputProps } from "./columnContext.ts";

/** A link and its level, as the form holds it: no `level` key for none, so clearing one leaves the form clean. */
interface LeveledLink {
  id: string;
  level?: number;
}

/** Links to a list's entities, each with a level of its own. */
type LeveledLinksField = Extract<EntityField, { input: "leveledLinks" }>;

/** A link and its level, none without one. */
function leveledLink(id: string, level: number | null | undefined): LeveledLink {
  return level == null ? { id } : { id, level };
}

/**
 * Links to a list's entities, each at a level of its own (a spell's spell lists): the entities of its kind it links
 * to, picked by name and kept sorted by it, then each one's level, from the field's `min` to its `max`, none too (a
 * level out of bounds says why under its input), under its kind's word. A new entity needs one when it's `required`.
 * Read-only, "—" for a level it has none of.
 */
export function LeveledLinksInput<T extends FieldValues>({
  context,
  field,
  form,
  name,
  rulesetId,
}: ColumnInputProps<T, LeveledLinksField>) {
  const levelError = (level: number | undefined) =>
    level === undefined ? undefined : wholeNumberError(level, field.min, field.max);
  const linked = useEntityLookup(context.knownLinks ?? []);
  const { rules } = useRulesetRules(rulesetId);
  const { field: bound, fieldState } = useController({
    control: form.control,
    name,
    rules: {
      ...(field.required !== undefined && context.newEntity && requiredRules(field.required)),
      validate: (value: LeveledLink[] | undefined) =>
        (value ?? []).every((link) => levelError(link.level) === undefined),
    },
  });
  // An empty list is the list's error; a level's is its input's
  const levelsInvalid = fieldState.error?.type === "validate";
  const selected: LeveledLink[] = Array.isArray(bound.value) ? bound.value : [];
  const selectedEntities = linked.resolve(selected.map((link) => link.id));
  const levelOf = (id: string) => selected.find((link) => link.id === id)?.level;
  const readOnly = useReadOnlyFields();

  return (
    <Stack spacing={3}>
      <EntitiesAutocomplete
        rulesetId={rulesetId}
        type={field.references}
        label={field.label}
        inputRef={bound.ref}
        error={levelsInvalid ? undefined : fieldState.error}
        value={selectedEntities}
        onChange={(next) => {
          linked.remember(next);
          bound.onChange([...next].sort(byName).map((entity) => leveledLink(entity.id, levelOf(entity.id))));
        }}
      />
      {selectedEntities.length > 0 && (
        <Stack spacing={1}>
          <SubsectionTitle>{entityTypeLabel(field.references, rules?.words)} Settings</SubsectionTitle>
          {selectedEntities.map((entity) => (
            <Stack key={entity.id} direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                {entity.name}
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
                value={levelOf(entity.id) ?? ""}
                error={levelsInvalid && levelError(levelOf(entity.id)) !== undefined}
                helperText={levelsInvalid && levelError(levelOf(entity.id))}
                onChange={(event) => {
                  const level = readNumberInput(event.target.value);
                  bound.onChange(selected.map((held) => (held.id === entity.id ? leveledLink(held.id, level) : held)));
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
