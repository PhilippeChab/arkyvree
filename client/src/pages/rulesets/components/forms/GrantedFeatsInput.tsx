import { Autocomplete, TextField } from "@mui/material";
import { useState } from "react";
import { type FieldValues, useController } from "react-hook-form";

import {
  EMPTY_VALUE_TEXT,
  ScrollSafeListbox,
  useReadOnlyFields,
  ValueChip,
} from "@/client/src/components/common/index.ts";
import { useDebouncedValue } from "@/client/src/hooks/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { useRulesetFeats } from "@/client/src/pages/rulesets/hooks/index.ts";

import { featKey, type LevelFeat, levelFeatLabel, sortLevelFeats } from "./classLevelForm.ts";
import type { ColumnInputProps } from "./columnContext.ts";

interface FeatOption extends LevelFeat {
  label: string;
}

/** The feats a class level grants, each through an aptitude. */
type GrantedFeatsField = Extract<EntityField, { input: "grantedFeats" }>;

/**
 * The feats a class level grants, as chips: each a feat and the aptitude it's taken for, one option per feat and
 * aptitude, the ruleset's feats searched and paged in as the list scrolls, kept sorted by label. Read-only under
 * `ReadOnlyFields`, "—" for none.
 */
export function GrantedFeatsInput<T extends FieldValues>({
  context,
  field,
  form,
  name,
  rulesetId,
}: ColumnInputProps<T, GrantedFeatsField>) {
  const { field: bound } = useController({ control: form.control, name });
  const feats: LevelFeat[] = Array.isArray(bound.value) ? bound.value : [];
  const readOnly = useReadOnlyFields();
  // The server searches the ruleset's feats and pages them in as the list scrolls.
  const [featSearch, setFeatSearch] = useState("");
  const debouncedFeatSearch = useDebouncedValue(featSearch);
  const {
    items: rulesetFeats,
    isLoading,
    error: featsError,
    onScroll,
  } = useRulesetFeats(rulesetId, debouncedFeatSearch);
  // Labels of the feats picked here, for when neither a later search nor the saved level lists them.
  const [pickedLabels, setPickedLabels] = useState<ReadonlyMap<string, string>>(new Map());

  // One option per feat and aptitude it can be taken for.
  const featOptions: FeatOption[] = rulesetFeats.flatMap((feat) =>
    feat.featsAptitudesInRules.map((fa) => ({
      featId: feat.id,
      aptitudeId: fa.aptitudeId,
      label: levelFeatLabel(feat.name, fa.aptitudesInRule?.name),
    })),
  );

  // The freshest label first: the loaded options, then the saved level's, then the one it was picked with.
  const selectedFeats = feats.map((feat): FeatOption => ({
    ...feat,
    label:
      featOptions.find((option) => featKey(option) === featKey(feat))?.label ??
      context.featLabels?.get(featKey(feat)) ??
      pickedLabels.get(featKey(feat)) ??
      "Unknown",
  }));

  // Kept sorted by label, so the order doesn't depend on picking order.
  const setFeats = (next: FeatOption[]) => {
    setPickedLabels(
      (labels) => new Map([...labels, ...next.map((option) => [featKey(option), option.label] as const)]),
    );
    bound.onChange(
      sortLevelFeats(next, (option) => option.label).map(({ featId, aptitudeId }) => ({ featId, aptitudeId })),
    );
  };

  return (
    <Autocomplete
      multiple
      readOnly={readOnly}
      options={featOptions}
      getOptionLabel={(option) => option.label}
      getOptionKey={(option) => featKey(option)}
      value={selectedFeats}
      onChange={(_, next) => setFeats(next)}
      isOptionEqualToValue={(option, value) => featKey(option) === featKey(value)}
      inputValue={featSearch}
      // Each render builds a new value, which the Autocomplete answers with a "reset" that would
      // clear the search as it's typed. Typing, picking a feat and blur still set it.
      onInputChange={(_, input, reason) => {
        if (reason !== "reset") setFeatSearch(input);
      }}
      filterOptions={(options) => options}
      loading={isLoading}
      noOptionsText={emptyOptionsText("Feats", featsError)}
      slotProps={{ listbox: { component: ScrollSafeListbox, onScroll } }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={field.label}
          // Read-only, "—" for none
          placeholder={readOnly ? (selectedFeats.length === 0 && EMPTY_VALUE_TEXT) || undefined : field.help}
          slotProps={readOnly ? { ...params.slotProps, inputLabel: { shrink: true } } : params.slotProps}
        />
      )}
      renderValue={(value, getItemProps) =>
        value.map((option, index) => (
          <ValueChip
            color="default"
            {...getItemProps({ index })}
            key={featKey(option)}
            label={option.label}
            onDelete={readOnly ? undefined : () => setFeats(selectedFeats.filter((_, i) => i !== index))}
          />
        ))
      }
    />
  );
}
