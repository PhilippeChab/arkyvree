import { type FieldValues, useController } from "react-hook-form";

import { APTITUDES_RULES } from "@/client/src/lib/validation.ts";
import { AptitudesAutocomplete } from "@/client/src/pages/rulesets/components/AptitudesAutocomplete.tsx";
import { byName } from "@/client/src/pages/rulesets/components/byName.ts";
import { useAptitudeLookup } from "@/client/src/pages/rulesets/components/useAptitudeLookup.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";

import type { ColumnInputProps } from "./columnContext.ts";

/** A pool's links, with no level of their own. */
type AptitudesField = Extract<EntityField, { input: "aptitudes" }>;

/**
 * A pool's links (a feat's feat pools): its aptitudes, picked by name, held by their ids, sorted by name. A new entity
 * needs one when it's `required`.
 */
export function AptitudesInput<T extends FieldValues>({
  context,
  field,
  form,
  name,
  rulesetId,
}: ColumnInputProps<T, AptitudesField>) {
  const aptitudes = useAptitudeLookup(context.knownAptitudes ?? []);
  const { field: bound, fieldState } = useController({
    control: form.control,
    name,
    rules: field.required && context.newEntity ? APTITUDES_RULES : undefined,
  });
  const ids: string[] = Array.isArray(bound.value) ? bound.value : [];
  return (
    <AptitudesAutocomplete
      rulesetId={rulesetId}
      inputRef={bound.ref}
      error={fieldState.error}
      value={aptitudes.resolve(ids)}
      onChange={(selected) => {
        aptitudes.remember(selected);
        bound.onChange([...selected].sort(byName).map((aptitude) => aptitude.id));
      }}
    />
  );
}
