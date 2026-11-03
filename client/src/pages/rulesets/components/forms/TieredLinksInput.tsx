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

import type { EntityInputProps } from "./fieldContext.ts";

/**
 * A link and its tier, as the form holds it and its save sends it (`{ toId, tier }`): no `tier` key for none, so
 * clearing one leaves the form clean.
 */
interface TieredLink {
  tier?: number;
  toId: string;
}

/** Links to a list's entities, each at a tier of its own. */
type TieredLinksField = Extract<EntityField, { input: "tieredLinks" }>;

/** A link and its tier, none without one. */
function tieredLink(toId: string, tier: number | null | undefined): TieredLink {
  return tier == null ? { toId } : { toId, tier };
}

/**
 * Links to a list's entities, each at a tier of its own (a spell's spell lists): the entities of its kind it links
 * to, picked by name and kept sorted by it, then each one's tier, from the field's `min` to its `max`, none too (a
 * tier out of bounds says why under its input), under its kind's word. A new entity needs one when it's `required`.
 * Read-only, "—" for a tier it has none of.
 */
export function TieredLinksInput<T extends FieldValues>({
  context,
  field,
  form,
  name,
  rulesetId,
}: EntityInputProps<T, TieredLinksField>) {
  const tierError = (tier: number | undefined) =>
    tier === undefined ? undefined : wholeNumberError(tier, field.min, field.max);
  const linked = useEntityLookup(context.knownLinks ?? []);
  const { rules } = useRulesetRules(rulesetId);
  const { field: bound, fieldState } = useController({
    control: form.control,
    name,
    rules: {
      ...(field.required !== undefined && context.newEntity && requiredRules(field.required)),
      validate: (value: TieredLink[] | undefined) => (value ?? []).every((link) => tierError(link.tier) === undefined),
    },
  });
  // An empty list is the list's error; a tier's is its input's
  const tiersInvalid = fieldState.error?.type === "validate";
  const selected: TieredLink[] = Array.isArray(bound.value) ? bound.value : [];
  const selectedEntities = linked.resolve(selected.map((link) => link.toId));
  const tierOf = (id: string) => selected.find((link) => link.toId === id)?.tier;
  const readOnly = useReadOnlyFields();

  return (
    <Stack spacing={3}>
      <EntitiesAutocomplete
        rulesetId={rulesetId}
        type={field.references}
        label={field.label}
        inputRef={bound.ref}
        error={tiersInvalid ? undefined : fieldState.error}
        value={selectedEntities}
        onChange={(next) => {
          linked.remember(next);
          bound.onChange([...next].sort(byName).map((entity) => tieredLink(entity.id, tierOf(entity.id))));
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
                label={rules?.tierWord.one}
                type="number"
                size="small"
                // Read-only, "—" for none
                placeholder={readOnly ? EMPTY_VALUE_TEXT : undefined}
                slotProps={{
                  htmlInput: { min: field.min, max: field.max },
                  input: { readOnly },
                  inputLabel: readOnly ? { shrink: true } : undefined,
                }}
                value={tierOf(entity.id) ?? ""}
                error={tiersInvalid && tierError(tierOf(entity.id)) !== undefined}
                helperText={tiersInvalid && tierError(tierOf(entity.id))}
                onChange={(event) => {
                  const tier = readNumberInput(event.target.value);
                  bound.onChange(
                    selected.map((held) => (held.toId === entity.id ? tieredLink(held.toId, tier) : held)),
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
