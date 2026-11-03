import { Box, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";

import { DataCell, DataRow, DataTable, OptionToggle } from "@/client/src/components/common/index.ts";
import { formatWordCount, type PositionWord, withArticle } from "@/client/src/lib/rulesetLabels.ts";

import { CHANGED_TEXT_SX } from "./changedCell.ts";
import { CustomTrackEditor } from "./CustomTrackEditor.tsx";
import { readWholeNumber } from "./progressionDraft.ts";
import { detectPreset, findNearestPreset, type OwnedValue, type ProgressionPreset } from "./progressionPresets.ts";

interface ProgressionTrackRowProps {
  /** Its owned entities' editor is open: the tab's, which its Discard and its save close */
  custom: boolean;
  /** How a value reads ("+6/+1" for a base attack bonus, "+4" for a save) */
  format: (value: number) => string;
  /** Its element's id */
  id: string;
  label: string;
  /** The highest value the rules take, which a typed one past it is set back to */
  max: number;
  /** The lowest value the rules take, which a typed one below it is set back to */
  min: number;
  onChange: (values: Record<string, number>) => void;
  onCustomChange: (custom: boolean) => void;
  /** Its owner kind's word, as a sentence says it ("class") */
  ownerWord: string;
  /**
   * Its rules' word for an owned entity's position along its owner, which names one ("Level 3"), and several ("Levels")
   */
  positionWord: PositionWord;
  /** The progressions it can follow: none for one number at every owned entity (skill points) */
  presets?: readonly ProgressionPreset[];
  /** Its values as saved, by position */
  saved: readonly OwnedValue[];
  /** What its one number is, when one sets every owned entity ("Points a Level") */
  unitLabel?: string;
  /** Its values as the tab holds them, by position */
  values: readonly OwnedValue[];
}

/** The toggle's value for a track that follows no preset. */
const CUSTOM = "custom";

/** Positions as a list: "1–3, 5". */
function listPositions(positions: readonly number[]) {
  const runs: string[] = [];
  for (let start = 0; start < positions.length;) {
    let end = start;
    while (end + 1 < positions.length && positions[end + 1] === positions[end] + 1) end++;
    runs.push(end > start ? `${positions[start]}–${positions[end]}` : String(positions[start]));
    start = end + 1;
  }
  return runs.join(", ");
}

/** The value a track holds at the most owned entities: what skill points' owned entities follow until one differs. */
function readMostCommon(values: readonly OwnedValue[]) {
  const counts = Map.groupBy(values, ({ value }) => value);
  return [...counts].toSorted((a, b) => b[1].length - a[1].length)[0]?.[0] ?? 0;
}

/**
 * A track of an owner's Progression tab (3.5's base attack bonus, a save, its skill points): the preset it follows,
 * which a click sets at every owned entity, or Custom, whose editor sets the owned entities that differ; one without
 * presets is one number (3.5's skill points). A change shows the owned entities it changes, before and after, until
 * it's saved or reverted.
 */
export function ProgressionTrackRow({
  custom,
  format,
  id,
  label,
  max,
  min,
  onChange,
  onCustomChange: setCustom,
  ownerWord,
  positionWord,
  presets,
  saved,
  unitLabel,
  values,
}: ProgressionTrackRowProps) {
  const [baseKey, setBaseKey] = useState<string>();
  const [baseValue, setBaseValue] = useState<number>();
  const [typing, setTyping] = useState<string | null>(null);
  const detected = presets && detectPreset(presets, values);
  // The Based On picked in the editor while it's open; the nearest preset otherwise
  const basePreset =
    presets &&
    ((custom ? presets.find((preset) => preset.key === baseKey) : undefined) ?? findNearestPreset(presets, values));
  const base = values.map(({ position }) =>
    basePreset ? basePreset.valueAt(position) : (baseValue ?? readMostCommon(values)),
  );
  const constant = values.every(({ value }) => value === values[0]?.value);
  const changed = values.filter(({ value }, index) => value !== saved[index]?.value);
  const differing = values.filter(({ value }, index) => value !== base[index]).map(({ position }) => position);
  const last = values.at(-1);
  const [positionSingular, positionPlural] = [positionWord.one.toLowerCase(), positionWord.many.toLowerCase()];
  const differingWord = differing.length === 1 ? positionSingular : positionPlural;

  const presetStatus = detected
    ? `${detected.label}: ${last ? `${format(last.value)} at ${positionSingular} ${last.position}` : `no ${positionPlural} yet`}`
    : `Custom: ${basePreset?.label} except at ${differingWord} ${listPositions(differing)}`;
  const constantStatus = constant
    ? `${values[0]?.value ?? 0} ${withArticle(positionSingular)}`
    : `Varies by ${positionSingular}`;
  const status = presets ? presetStatus : constantStatus;

  const follow = (preset: ProgressionPreset) => {
    setCustom(false);
    onChange(Object.fromEntries(values.map(({ position, ownedId }) => [ownedId, preset.valueAt(position)])));
  };

  const rebase = (key: string) => {
    const next = presets?.find((preset) => preset.key === key);
    if (!next || !basePreset) return;
    setBaseKey(next.key);
    // Owned entities that followed the old base follow the new one; overrides stay
    onChange(
      Object.fromEntries(
        values.map(({ position, ownedId, value }) => [
          ownedId,
          value === basePreset.valueAt(position) ? next.valueAt(position) : value,
        ]),
      ),
    );
  };

  return (
    <Stack id={id} spacing={1.5} sx={{ py: 2, borderTop: 1, borderColor: "divider" }}>
      {presets ? (
        <OptionToggle
          label={label}
          caption={status}
          value={custom || !detected ? CUSTOM : detected.key}
          options={[
            ...presets.map(({ key, label: presetLabel }) => ({ label: presetLabel, value: key })),
            { label: "Custom", value: CUSTOM },
          ]}
          onChange={(next) => {
            const preset = presets.find((p) => p.key === next);
            if (preset) {
              follow(preset);
              return;
            }
            setCustom(true);
            setBaseKey((detected ?? findNearestPreset(presets, values)).key);
          }}
          // A track that follows no preset is Custom already, whose toggle a click can't select again: its levels open
          // from a button on the toggle's line
          action={
            !custom &&
            !detected && (
              <Button
                size="small"
                onClick={() => {
                  // Its base stays the one nearest its values as they are, however they're typed after
                  setBaseKey(findNearestPreset(presets, values).key);
                  setCustom(true);
                }}
              >
                Edit {positionWord.many}
              </Button>
            )
          }
        />
      ) : (
        <Box>
          <Typography variant="subtitle2" component="p" gutterBottom sx={{ color: "text.secondary" }}>
            {label}
          </Typography>
          <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <TextField
              size="small"
              type="number"
              label={unitLabel}
              // What's typed shows as it is (an emptied field before its new number) until the field is left
              value={typing ?? (constant ? (values[0]?.value ?? "") : "")}
              placeholder={constant ? undefined : "Varies"}
              onBlur={() => setTyping(null)}
              onChange={(e) => {
                const read = readWholeNumber(e.target.value);
                const typed = read === undefined ? undefined : Math.max(min, Math.min(read, max));
                // Past the bound, it shows the bound it takes
                setTyping(typed !== undefined && typed !== read ? String(typed) : e.target.value);
                if (typed === undefined) return;
                setBaseValue(typed);
                onChange(Object.fromEntries(values.map(({ ownedId }) => [ownedId, typed])));
              }}
              slotProps={{ htmlInput: { min } }}
              sx={{ width: 180 }}
            />
            <Button
              size="small"
              onClick={() => {
                const common = readMostCommon(values);
                setBaseValue(common);
                // Back to one number: every owned entity takes the one most of them have
                if (custom) onChange(Object.fromEntries(values.map(({ ownedId }) => [ownedId, common])));
                setCustom(!custom);
              }}
            >
              {custom ? `Same at Every ${positionWord.one}` : `Vary by ${positionWord.one}`}
            </Button>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {status}
            </Typography>
          </Stack>
        </Box>
      )}
      {changed.length > 0 && (
        <Stack spacing={0.5} sx={{ border: 1, borderColor: "secondary.main", borderRadius: 1, px: 1.5, py: 1 }}>
          {/* What changes on the left, its Revert on the far right */}
          <Stack direction="row" spacing={2} sx={{ alignItems: "baseline", justifyContent: "space-between" }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Changes {formatWordCount(changed.length, positionWord)}
            </Typography>
            <Button
              size="small"
              onClick={() => {
                setCustom(false);
                onChange(Object.fromEntries(saved.map(({ ownedId, value }) => [ownedId, value])));
              }}
            >
              Revert
            </Button>
          </Stack>
          <DataTable
            size="small"
            columns={[
              { key: "change", label: positionWord.one },
              ...changed.map(({ position }) => ({
                key: String(position),
                label: String(position),
                align: "center" as const,
              })),
            ]}
          >
            <DataRow>
              <DataCell slot="primary">Before</DataCell>
              {changed.map(({ position }) => (
                <DataCell key={position} slot="inline" align="center" label={`${positionWord.one} ${position}`}>
                  {format(saved.find((s) => s.position === position)?.value ?? 0)}
                </DataCell>
              ))}
            </DataRow>
            <DataRow>
              <DataCell slot="primary">After</DataCell>
              {changed.map(({ position, value }) => (
                <DataCell key={position} slot="inline" align="center" sx={CHANGED_TEXT_SX}>
                  {format(value)}
                </DataCell>
              ))}
            </DataRow>
          </DataTable>
        </Stack>
      )}
      {custom && (
        <CustomTrackEditor
          label={label}
          max={max}
          min={min}
          values={values}
          base={base}
          onChange={onChange}
          onClose={() => setCustom(false)}
          ownerWord={ownerWord}
          positionWord={positionWord}
          baseControl={
            presets && (
              <TextField
                select
                size="small"
                label="Based On"
                value={basePreset?.key ?? ""}
                onChange={(e) => rebase(e.target.value)}
                sx={{ width: 160 }}
              >
                {presets.map((preset) => (
                  <MenuItem key={preset.key} value={preset.key}>
                    {preset.label}
                  </MenuItem>
                ))}
              </TextField>
            )
          }
        />
      )}
    </Stack>
  );
}
