import { Box, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";

import { DataCell, DataRow, DataTable, OptionToggle } from "@/client/src/components/common/index.ts";
import { readNumberInput } from "@/client/src/lib/validation.ts";

import { CustomTrackEditor } from "./CustomTrackEditor.tsx";
import { detectPreset, findNearestPreset, type LevelValue, type ProgressionPreset } from "./progressionPresets.ts";

interface ProgressionTrackRowProps {
  /** How a value reads ("+6/+1" for a base attack bonus, "+4" for a save) */
  format: (value: number) => string;
  /** Its element's id */
  id: string;
  label: string;
  onChange: (values: Record<string, number>) => void;
  /** The progressions it can follow: none for one number at every level (skill points) */
  presets?: readonly ProgressionPreset[];
  /** Its values as saved, by level */
  saved: readonly LevelValue[];
  /** Its values as the tab holds them, by level */
  values: readonly LevelValue[];
}

/** The toggle's value for a track that follows no preset. */
const CUSTOM = "custom";

/** Its levels as a list: "1–3, 5". */
function listLevels(levels: readonly number[]) {
  const runs: string[] = [];
  for (let start = 0; start < levels.length;) {
    let end = start;
    while (end + 1 < levels.length && levels[end + 1] === levels[end] + 1) end++;
    runs.push(end > start ? `${levels[start]}–${levels[end]}` : String(levels[start]));
    start = end + 1;
  }
  return runs.join(", ");
}

/** The value a track holds at the most levels: what skill points' levels follow until one differs. */
function readMostCommon(values: readonly LevelValue[]) {
  const counts = Map.groupBy(values, ({ value }) => value);
  return [...counts].toSorted((a, b) => b[1].length - a[1].length)[0]?.[0] ?? 0;
}

/**
 * A track of a class's Progression tab (its base attack bonus, a save, its skill points): the preset it follows, which
 * a click sets at every level, or Custom, whose editor sets the levels that differ; skill points are one number. A
 * change shows the levels it changes, before and after, until it's saved or reverted.
 */
export function ProgressionTrackRow({ format, id, label, onChange, presets, saved, values }: ProgressionTrackRowProps) {
  const [custom, setCustom] = useState(false);
  const [baseKey, setBaseKey] = useState<string>();
  const [baseValue, setBaseValue] = useState<number>();
  const [typing, setTyping] = useState<string | null>(null);
  const detected = presets && detectPreset(presets, values);
  const basePreset =
    presets && (presets.find((preset) => preset.key === baseKey) ?? findNearestPreset(presets, values));
  const base = values.map(({ level }) =>
    basePreset ? basePreset.valueAt(level) : (baseValue ?? readMostCommon(values)),
  );
  const constant = values.every(({ value }) => value === values[0]?.value);
  const changed = values.filter(({ value }, index) => value !== saved[index]?.value);
  const differing = values.filter(({ value }, index) => value !== base[index]).map(({ level }) => level);
  const last = values.at(-1);

  const presetStatus = detected
    ? `${detected.label}: ${last ? `${format(last.value)} at level ${last.level}` : "no levels yet"}`
    : `Custom: ${basePreset?.label} except at ${differing.length === 1 ? "level" : "levels"} ${listLevels(differing)}`;
  const status = presets ? presetStatus : constant ? `${values[0]?.value ?? 0} a level` : "Varies by level";

  const follow = (preset: ProgressionPreset) => {
    setCustom(false);
    onChange(Object.fromEntries(values.map(({ level, levelId }) => [levelId, preset.valueAt(level)])));
  };

  const rebase = (key: string) => {
    const next = presets?.find((preset) => preset.key === key);
    if (!next || !basePreset) return;
    setBaseKey(next.key);
    // Levels that followed the old base follow the new one; overrides stay
    onChange(
      Object.fromEntries(
        values.map(({ level, levelId, value }) => [
          levelId,
          value === basePreset.valueAt(level) ? next.valueAt(level) : value,
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
              label="Points a Level"
              // What's typed shows as it is (an emptied field before its new number) until the field is left
              value={typing ?? (constant ? (values[0]?.value ?? "") : "")}
              placeholder={constant ? undefined : "Varies"}
              onBlur={() => setTyping(null)}
              onChange={(e) => {
                setTyping(e.target.value);
                const typed = readNumberInput(e.target.value);
                if (typed === undefined || !Number.isInteger(typed) || typed < 0) return;
                setBaseValue(typed);
                onChange(Object.fromEntries(values.map(({ levelId }) => [levelId, typed])));
              }}
              slotProps={{ htmlInput: { min: 0 } }}
              sx={{ width: 180 }}
            />
            <Button
              size="small"
              onClick={() => {
                setBaseValue(readMostCommon(values));
                setCustom(!custom);
              }}
            >
              {custom ? "Same at Every Level" : "Vary by Level"}
            </Button>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {status}
            </Typography>
          </Stack>
        </Box>
      )}
      {changed.length > 0 && (
        <Stack spacing={0.5} sx={{ border: 1, borderColor: "secondary.main", borderRadius: 1, px: 1.5, py: 1 }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: "baseline" }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Changes {changed.length} {changed.length === 1 ? "level" : "levels"}
            </Typography>
            <Button
              size="small"
              onClick={() => {
                setCustom(false);
                onChange(Object.fromEntries(saved.map(({ levelId, value }) => [levelId, value])));
              }}
            >
              Revert
            </Button>
          </Stack>
          <DataTable
            size="small"
            columns={[
              { key: "change", label: "Level" },
              ...changed.map(({ level }) => ({ key: String(level), label: String(level), align: "center" as const })),
            ]}
          >
            <DataRow>
              <DataCell slot="primary">Before</DataCell>
              {changed.map(({ level }) => (
                <DataCell key={level} slot="inline" align="center" label={`Level ${level}`}>
                  {format(saved.find((s) => s.level === level)?.value ?? 0)}
                </DataCell>
              ))}
            </DataRow>
            <DataRow>
              <DataCell slot="primary">After</DataCell>
              {changed.map(({ level, value }) => (
                <DataCell key={level} slot="inline" align="center" sx={{ fontWeight: 600, color: "secondary.dark" }}>
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
          values={values}
          base={base}
          onChange={onChange}
          onClose={() => setCustom(false)}
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
