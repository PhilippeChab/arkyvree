import { Autocomplete, Box, TextField } from "@mui/material";
import { useMemo, useState } from "react";
import { useController, type UseFormReturn } from "react-hook-form";

import { LoadError, ScrollSafeListbox, ValueChip } from "@/client/src/components/common/index.ts";
import { useDebouncedValue } from "@/client/src/hooks/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";
import { readNumberInput } from "@/client/src/lib/validation.ts";
import { type Save, useRulesetFeats } from "@/client/src/pages/rulesets/hooks/index.ts";
import { MAX_SAVE_BASE } from "@/shared/dnd3.5/classes.ts";

import {
  areSaveBasesValid,
  type ClassLevelFormData,
  featKey,
  type LevelFeat,
  levelFeatLabel,
  saveBaseError,
} from "./classLevelForm.ts";

interface ClassLevelFieldsProps {
  /** Labels for feats the options may not list (e.g. from a parent ruleset), by `featId-aptitudeId`. */
  featLabels?: Map<string, string>;
  form: UseFormReturn<ClassLevelFormData>;
  rulesetId: string;
  /** The ruleset's saves, each a base field; its owner reads them, for what it sends. */
  rulesetSaves: Save[] | undefined;
  /** Why they didn't load. */
  savesError: unknown;
}

interface FeatOption extends LevelFeat {
  label: string;
}

/** A class level's base saves and granted feats, bound to its form: its create dialog's and its page's. */
export function ClassLevelFields({ form, rulesetId, rulesetSaves, savesError, featLabels }: ClassLevelFieldsProps) {
  // Each base out of bounds says why, under its own input
  const { field: savesField, fieldState: savesState } = useController({
    control: form.control,
    name: "saves",
    rules: { validate: areSaveBasesValid },
  });
  const { field: featsField } = useController({ control: form.control, name: "feats" });
  const saves = savesField.value ?? [];
  const feats = featsField.value ?? [];
  const savesInvalid = !!savesState.error;
  const saveList = rulesetSaves ?? [];
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
  const featOptions = useMemo<FeatOption[]>(
    () =>
      rulesetFeats.flatMap((feat) =>
        feat.featsAptitudesInRules.map((fa) => ({
          featId: feat.id,
          aptitudeId: fa.aptitudeId,
          label: levelFeatLabel(feat.name, fa.aptitudesInRule?.name),
        })),
      ),
    [rulesetFeats],
  );

  // The freshest label first: the loaded options, then the saved level's, then the one it was picked with.
  const selectedFeats = feats.map((feat): FeatOption => ({
    ...feat,
    label:
      featOptions.find((o) => featKey(o) === featKey(feat))?.label ??
      featLabels?.get(featKey(feat)) ??
      pickedLabels.get(featKey(feat)) ??
      "Unknown",
  }));

  const baseFor = (saveId: string) => saves.find((s) => s.saveId === saveId)?.base ?? 0;

  // Update in place, so changing a value back leaves the form clean.
  const setBase = (saveId: string, base: number) =>
    savesField.onChange(
      saves.some((s) => s.saveId === saveId)
        ? saves.map((s) => (s.saveId === saveId ? { saveId, base } : s))
        : [...saves, { saveId, base }],
    );

  // Kept sorted by label, so the order doesn't depend on picking order.
  const setFeats = (next: FeatOption[]) => {
    setPickedLabels((labels) => new Map([...labels, ...next.map((o) => [featKey(o), o.label] as const)]));
    featsField.onChange(
      [...next]
        .sort((a, b) => a.label.localeCompare(b.label))
        .map(({ featId, aptitudeId }) => ({ featId, aptitudeId })),
    );
  };

  return (
    <>
      {!!savesError && saveList.length === 0 && <LoadError what="Saves" error={savesError} />}
      {saveList.length > 0 && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: `repeat(${Math.min(saveList.length, 3)}, 1fr)` },
            gap: 2,
          }}
        >
          {saveList.map((save) => (
            <TextField
              key={save.id}
              label={`${save.name} Save`}
              type="number"
              value={baseFor(save.id)}
              onChange={(e) => setBase(save.id, readNumberInput(e.target.value) ?? 0)}
              error={savesInvalid && saveBaseError(baseFor(save.id)) !== undefined}
              helperText={savesInvalid && saveBaseError(baseFor(save.id))}
              slotProps={{ htmlInput: { min: 0, max: MAX_SAVE_BASE } }}
            />
          ))}
        </Box>
      )}
      <Autocomplete
        multiple
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
        filterOptions={(opts) => opts}
        loading={isLoading}
        noOptionsText={emptyOptionsText("Feats", featsError)}
        slotProps={{ listbox: { component: ScrollSafeListbox, onScroll } }}
        renderInput={(params) => (
          <TextField {...params} label="Feats" placeholder="Select feats with aptitudes granted at this level" />
        )}
        renderValue={(value, getItemProps) =>
          value.map((option, index) => (
            <ValueChip
              color="default"
              {...getItemProps({ index })}
              key={featKey(option)}
              label={option.label}
              onDelete={() => setFeats(selectedFeats.filter((_, i) => i !== index))}
            />
          ))
        }
      />
    </>
  );
}
