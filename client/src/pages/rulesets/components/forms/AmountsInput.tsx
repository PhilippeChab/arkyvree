import { Box, TextField } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { type FieldValues, useController } from "react-hook-form";

import { LoadError, useReadOnlyFields } from "@/client/src/components/common/index.ts";
import { useRulesetRules } from "@/client/src/hooks/index.ts";
import { rulesetOptionsQuery } from "@/client/src/lib/queries.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import { readNumberInput, wholeNumberError } from "@/client/src/lib/validation.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";

import type { ColumnInputProps } from "./columnContext.ts";

/** An amount given an entity, as its input holds it and its save sends it: the entity's id (`toId`) and the amount. */
interface Amount {
  amount: number;
  toId: string;
}

/** An amount an entity gives each entity of a kind (a class level's base bonus to each save). */
type AmountsField = Extract<EntityField, { input: "amounts" }>;

/**
 * The amount an entity gives each of the ruleset's entities of its field's kind (a class level's base bonus to each of
 * its saves), side by side (three a row at most), each named with its kind's word, from the field's `min` to its `max`,
 * 0 unset; one out of bounds says why under its own input. Read-only under `ReadOnlyFields`.
 */
export function AmountsInput<T extends FieldValues>({
  field,
  form,
  name,
  rulesetId,
}: ColumnInputProps<T, AmountsField>) {
  const amountError = (amount: number) => wholeNumberError(amount, field.min, field.max);
  const { data: rulesetEntities, error: entitiesError } = useQuery(rulesetOptionsQuery(field.references, rulesetId));
  const { rules } = useRulesetRules(rulesetId);
  const { field: bound, fieldState } = useController({
    control: form.control,
    name,
    rules: {
      validate: (value: Amount[] | undefined) => (value ?? []).every((given) => !amountError(Number(given.amount))),
    },
  });
  const amounts: Amount[] = Array.isArray(bound.value) ? bound.value : [];
  const invalid = !!fieldState.error;
  const readOnly = useReadOnlyFields();
  const entities = rulesetEntities ?? [];
  const amountFor = (id: string) => Number(amounts.find((given) => given.toId === id)?.amount ?? 0);

  // Update in place, so changing a value back leaves the form clean.
  const setAmount = (id: string, amount: number) =>
    bound.onChange(
      amounts.some((given) => given.toId === id)
        ? amounts.map((given) => (given.toId === id ? { toId: id, amount } : given))
        : [...amounts, { toId: id, amount }],
    );

  if (!!entitiesError && entities.length === 0)
    return <LoadError what={entityTypeLabel(field.references, rules?.words, true)} error={entitiesError} />;
  if (entities.length === 0) return null;
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: `repeat(${Math.min(entities.length, 3)}, 1fr)` },
        gap: 2,
      }}
    >
      {entities.map((entity, index) => (
        <TextField
          key={entity.id}
          // The amounts' one field: a failed submit focuses its first input
          inputRef={index === 0 ? bound.ref : undefined}
          label={`${entity.name} ${entityTypeLabel(field.references, rules?.words)}`}
          type="number"
          value={amountFor(entity.id)}
          onChange={(event) => setAmount(entity.id, readNumberInput(event.target.value) ?? 0)}
          error={invalid && amountError(amountFor(entity.id)) !== undefined}
          helperText={invalid && amountError(amountFor(entity.id))}
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
