import { type FieldValues, useController } from "react-hook-form";

import { requiredRules } from "@/client/src/lib/validation.ts";
import { byName } from "@/client/src/pages/rulesets/components/byName.ts";
import { EntitiesAutocomplete } from "@/client/src/pages/rulesets/components/EntitiesAutocomplete.tsx";
import { useEntityLookup } from "@/client/src/pages/rulesets/components/useEntityLookup.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";

import type { ColumnInputProps } from "./columnContext.ts";

/** Links to a list's entities, with no level of their own. */
type LinksField = Extract<EntityField, { input: "links" }>;

/**
 * Links to a list's entities (a feat's feat pools): the entities of its kind it links to, picked by name, held by their
 * ids, sorted by name. A new entity needs one when it's `required`.
 */
export function LinksInput<T extends FieldValues>({
  context,
  field,
  form,
  name,
  rulesetId,
}: ColumnInputProps<T, LinksField>) {
  const linked = useEntityLookup(context.knownLinks ?? []);
  const { field: bound, fieldState } = useController({
    control: form.control,
    name,
    rules: field.required !== undefined && context.newEntity ? requiredRules(field.required) : undefined,
  });
  const ids: string[] = Array.isArray(bound.value) ? bound.value : [];
  return (
    <EntitiesAutocomplete
      rulesetId={rulesetId}
      type={field.references}
      label={field.label}
      inputRef={bound.ref}
      error={fieldState.error}
      value={linked.resolve(ids)}
      onChange={(selected) => {
        linked.remember(selected);
        bound.onChange([...selected].sort(byName).map((entity) => entity.id));
      }}
    />
  );
}
