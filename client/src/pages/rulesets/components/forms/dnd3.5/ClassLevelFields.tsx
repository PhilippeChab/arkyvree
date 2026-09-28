import { Autocomplete, Box, Chip, TextField } from "@mui/material";
import { useMemo, useState } from "react";

import { ScrollSafeListbox } from "@/client/src/components/common/index.ts";
import { useDebouncedValue, useRulesetFeats, useRulesetSaves } from "@/client/src/hooks/index.ts";
import { featKey, levelFeatLabel, type LevelFeat, type LevelSave } from "./classLevelForm.ts";

interface FeatOption extends LevelFeat {
  label: string;
}

interface ClassLevelFieldsProps {
  rulesetId: string;
  saves: LevelSave[];
  onSavesChange: (saves: LevelSave[]) => void;
  feats: LevelFeat[];
  onFeatsChange: (feats: LevelFeat[]) => void;
  /** Labels for feats the options may not list (e.g. from a parent ruleset), by `featId-aptitudeId`. */
  featLabels?: Map<string, string>;
}

/** Base saves and granted feats of a class level, shared by its create dialog and its customization page. */
export function ClassLevelFields({ rulesetId, saves, onSavesChange, feats, onFeatsChange, featLabels }: ClassLevelFieldsProps) {
  const { data: rulesetSaves = [] } = useRulesetSaves(rulesetId);
  // The server searches the ruleset's feats and pages them in as the list scrolls.
  const [featSearch, setFeatSearch] = useState("");
  const debouncedFeatSearch = useDebouncedValue(featSearch);
  const { items: rulesetFeats, isLoading: featsLoading, onScroll } = useRulesetFeats(rulesetId, debouncedFeatSearch);
  // Labels of the feats picked here, which a later search may not list.
  const [pickedLabels, setPickedLabels] = useState<ReadonlyMap<string, string>>(new Map());

  // One option per feat and aptitude it can be taken for.
  const featOptions = useMemo<FeatOption[]>(() => rulesetFeats.flatMap((feat) =>
    feat.featsAptitudesInRules.map((fa) => ({
      featId: feat.id,
      aptitudeId: fa.aptitudeId,
      label: levelFeatLabel(feat.name, fa.aptitudesInRule?.name),
    }))), [rulesetFeats]);

  const selectedFeats = feats.map((feat): FeatOption => ({
    ...feat,
    label: pickedLabels.get(featKey(feat))
      ?? featLabels?.get(featKey(feat))
      ?? featOptions.find((o) => featKey(o) === featKey(feat))?.label
      ?? "Unknown",
  }));
  // Selected feats the current search doesn't list stay among the options, so the Autocomplete finds its value.
  const listedKeys = new Set(featOptions.map(featKey));
  const options = [...selectedFeats.filter((feat) => !listedKeys.has(featKey(feat))), ...featOptions];

  const baseFor = (saveId: string) => saves.find((s) => s.saveId === saveId)?.base ?? 0;

  // Update in place, so changing a value back leaves the form clean.
  const setBase = (saveId: string, base: number) =>
    onSavesChange(saves.some((s) => s.saveId === saveId)
      ? saves.map((s) => (s.saveId === saveId ? { saveId, base } : s))
      : [...saves, { saveId, base }]);

  // Kept sorted by label, so the order doesn't depend on picking order.
  const setFeats = (next: FeatOption[]) => {
    setFeatSearch("");
    setPickedLabels((labels) => new Map([...labels, ...next.map((o) => [featKey(o), o.label] as const)]));
    onFeatsChange([...next]
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(({ featId, aptitudeId }) => ({ featId, aptitudeId })));
  };

  return (
    <>
      {rulesetSaves.length > 0 && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: `repeat(${Math.min(rulesetSaves.length, 3)}, 1fr)` }, gap: 2 }}>
          {rulesetSaves.map((save) => (
            <TextField
              key={save.id}
              label={`${save.name} Save`}
              type="number"
              value={baseFor(save.id)}
              onChange={(e) => setBase(save.id, Number(e.target.value))}
              slotProps={{ htmlInput: { min: 0, max: 12 } }}
            />
          ))}
        </Box>
      )}
      <Autocomplete
        multiple
        options={options}
        getOptionLabel={(option) => option.label}
        value={selectedFeats}
        onChange={(_, next) => setFeats(next)}
        isOptionEqualToValue={(option, value) => featKey(option) === featKey(value)}
        inputValue={featSearch}
        // Each render builds a new value, which the Autocomplete answers with a reset: only typing
        // and blur change the search, and picking a feat clears it (setFeats).
        onInputChange={(_, input, reason) => {
          if (reason !== "reset") setFeatSearch(input);
        }}
        filterOptions={(opts) => opts}
        loading={featsLoading}
        slotProps={{ listbox: { component: ScrollSafeListbox, onScroll } }}
        renderInput={(params) => (
          <TextField {...params} label="Feats" placeholder="Select feats with aptitudes granted at this level" />
        )}
        renderValue={(value, getItemProps) =>
          value.map((option, index) => (
            <Chip
              {...getItemProps({ index })}
              key={featKey(option)}
              variant="outlined"
              label={option.label}
              onDelete={() => setFeats(selectedFeats.filter((_, i) => i !== index))}
            />
          ))}
      />
    </>
  );
}
