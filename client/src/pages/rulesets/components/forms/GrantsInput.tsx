import { Autocomplete, TextField } from "@mui/material";
import { keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { type FieldValues, useController } from "react-hook-form";

import {
  EMPTY_VALUE_TEXT,
  ScrollSafeListbox,
  useReadOnlyFields,
  ValueChip,
} from "@/client/src/components/common/index.ts";
import { useDebouncedValue, useListboxQuery } from "@/client/src/hooks/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { useEntityColumns } from "@/client/src/pages/rulesets/hooks/index.ts";
import { entityOptionsQuery } from "@/client/src/pages/rulesets/optionQueries.ts";

import type { ColumnInputProps } from "./columnContext.ts";
import { poolsOf } from "./entityFields.ts";
import { grantKey, grantLabel, sortGrants } from "./grants.ts";

/** A grant its input offers or shows: its entity's id and the one it's through's, and its label. */
interface GrantOption {
  entityId: string;
  label: string;
  viaId: string;
}

/** A grant as its input holds it: its entity's id and the one it's through's, at its field's keys. */
type Grant = Record<string, string>;

/** The entities an entity grants, each through another (a class level's feats, each through a pool). */
type GrantsField = Extract<EntityField, { input: "grants" }>;

/**
 * The entities an entity grants (a class level's feats), as chips: each an entity of its field's kind and the pool it's
 * granted through, one option per entity and pool, the ruleset's entities of its kind searched and paged in as the list
 * scrolls, kept sorted by label. Read-only under `ReadOnlyFields`, "—" for none.
 */
export function GrantsInput<T extends FieldValues>({
  context,
  field,
  form,
  name,
  rulesetId,
}: ColumnInputProps<T, GrantsField>) {
  const { entityKey, viaKey } = field;
  const { field: bound } = useController({ control: form.control, name });
  const grants: Grant[] = Array.isArray(bound.value) ? bound.value : [];
  const readOnly = useReadOnlyFields();
  // The server searches the ruleset's entities of its kind and pages them in as the list scrolls.
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const {
    items: entities,
    isLoading,
    error,
    onScroll,
  } = useListboxQuery({
    ...entityOptionsQuery(rulesetId, field.references, debouncedSearch, { limit: 50 }),
    placeholderData: keepPreviousData,
  });
  // An entity's pools, where its rules' columns say a read holds them
  const { columns } = useEntityColumns(rulesetId, field.references);
  // Labels of the grants picked here, for when neither a later search nor the saved entity lists them.
  const [pickedLabels, setPickedLabels] = useState<ReadonlyMap<string, string>>(new Map());

  // One option per entity and pool it can be granted through.
  const options: GrantOption[] = entities.flatMap((entity) =>
    poolsOf(columns, entity).map((pool) => ({
      entityId: entity.id,
      viaId: pool.id,
      label: grantLabel(entity.name, pool.name),
    })),
  );
  const keyOf = (option: GrantOption) => grantKey(option.entityId, option.viaId);

  // The freshest label first: the loaded options, then the saved entity's, then the one it was picked with.
  const selected = grants.map((grant): GrantOption => {
    const key = grantKey(grant[entityKey], grant[viaKey]);
    return {
      entityId: grant[entityKey],
      viaId: grant[viaKey],
      label:
        options.find((option) => keyOf(option) === key)?.label ??
        context.grantLabels?.get(key) ??
        pickedLabels.get(key) ??
        "Unknown",
    };
  });

  // Kept sorted by label, so the order doesn't depend on picking order.
  const setGrants = (next: GrantOption[]) => {
    setPickedLabels((labels) => new Map([...labels, ...next.map((option) => [keyOf(option), option.label] as const)]));
    bound.onChange(
      sortGrants(next, (option) => option.label).map(({ entityId, viaId }) => ({
        [entityKey]: entityId,
        [viaKey]: viaId,
      })),
    );
  };

  return (
    <Autocomplete
      multiple
      readOnly={readOnly}
      options={options}
      getOptionLabel={(option) => option.label}
      getOptionKey={keyOf}
      value={selected}
      onChange={(_, next) => setGrants(next)}
      isOptionEqualToValue={(option, value) => keyOf(option) === keyOf(value)}
      inputValue={search}
      // Each render builds a new value, which the Autocomplete answers with a "reset" that would
      // clear the search as it's typed. Typing, picking an entity and blur still set it.
      onInputChange={(_, input, reason) => {
        if (reason !== "reset") setSearch(input);
      }}
      filterOptions={(all) => all}
      loading={isLoading}
      noOptionsText={emptyOptionsText(field.label, error)}
      slotProps={{ listbox: { component: ScrollSafeListbox, onScroll } }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={field.label}
          // Read-only, "—" for none
          placeholder={readOnly ? (selected.length === 0 && EMPTY_VALUE_TEXT) || undefined : field.help}
          slotProps={readOnly ? { ...params.slotProps, inputLabel: { shrink: true } } : params.slotProps}
        />
      )}
      renderValue={(value, getItemProps) =>
        value.map((option, index) => (
          <ValueChip
            color="default"
            {...getItemProps({ index })}
            key={keyOf(option)}
            label={option.label}
            onDelete={readOnly ? undefined : () => setGrants(selected.filter((_, i) => i !== index))}
          />
        ))
      }
    />
  );
}
