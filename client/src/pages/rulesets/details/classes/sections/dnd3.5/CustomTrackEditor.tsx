import { Box, Button, InputBase, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { type ReactNode, useState } from "react";

import { readWholeNumber } from "./progressionDraft.ts";
import type { LevelValue } from "./progressionPresets.ts";

interface CustomTrackEditorProps {
  /** What the levels follow until one differs: a preset's values, or a number at every level, aligned with `values` */
  base: readonly number[];
  /** Its choice of what the levels follow (a preset), before its hint */
  baseControl?: ReactNode;
  /** What the track's inputs say they are ("Reflex", "Skill points") */
  label: string;
  onChange: (values: Record<string, number>) => void;
  onClose: () => void;
  values: readonly LevelValue[];
}

/** An operation the level range applies: a value at every level of it, or one added to or taken from each. */
type RangeOperation = "add" | "set" | "subtract";

/** The operations a level range applies, as its menu lists them. */
const RANGE_OPERATIONS: { label: string; value: RangeOperation }[] = [
  { label: "set to", value: "set" },
  { label: "add", value: "add" },
  { label: "subtract", value: "subtract" },
];

/** A typed level's value: a whole number, 0 at least, or its base when it isn't one. */
function readLevelInput(text: string, fallback: number) {
  return readWholeNumber(text) ?? fallback;
}

/**
 * A track's values level by level, for a class whose track follows no preset: each level that follows its base shows
 * the base greyed, so only the levels that differ are typed, and a bar a level shows its shape, an override in gold.
 * A level range sets, adds to or takes from every level of it at once.
 */
export function CustomTrackEditor({ base, baseControl, label, onChange, onClose, values }: CustomTrackEditorProps) {
  // The range's fields as typed, read when it's applied
  const [range, setRange] = useState({
    from: "1",
    to: String(values.at(-1)?.level ?? 1),
    operation: "set" as RangeOperation,
    amount: "0",
  });
  // A level's input as typed (an emptied one before its new number), until it's left
  const [typing, setTyping] = useState<{ levelId: string; text: string } | null>(null);
  const highest = Math.max(1, ...values.map(({ value }) => value), ...base);

  const applyRange = () => {
    const [start, end, amount] = [
      readLevelInput(range.from, 1),
      readLevelInput(range.to, 1),
      readLevelInput(range.amount, 0),
    ];
    const [from, to] = [Math.min(start, end), Math.max(start, end)];
    const changed = values.filter(({ level }) => level >= from && level <= to);
    const next = (value: number) =>
      range.operation === "set" ? amount : value + (range.operation === "add" ? amount : -amount);
    onChange(Object.fromEntries(changed.map(({ levelId, value }) => [levelId, Math.max(0, next(value))])));
  };

  return (
    <Stack
      spacing={1.5}
      sx={{ p: 2, borderRadius: 1, border: 1, borderColor: "divider", bgcolor: "background.default" }}
    >
      <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
        {baseControl}
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          Greyed levels follow it: type only where this class differs.
        </Typography>
      </Stack>
      <Box sx={{ overflowX: "auto" }}>
        <Stack spacing={0.5} sx={{ minWidth: values.length * 30 }}>
          <Box
            aria-hidden
            sx={{
              display: "grid",
              gridTemplateColumns: `repeat(${values.length}, 1fr)`,
              gap: 0.5,
              alignItems: "end",
              height: 56,
            }}
          >
            {values.map(({ levelId, value }, index) => (
              <Box
                key={levelId}
                sx={{
                  height: `${Math.max(4, (value / highest) * 100)}%`,
                  borderRadius: 0.5,
                  bgcolor: value === base[index] ? "primary.light" : "secondary.main",
                  opacity: value === base[index] ? 0.5 : 1,
                }}
              />
            ))}
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${values.length}, 1fr)`, gap: 0.5 }}>
            {values.map(({ level, levelId, value }, index) => {
              const overridden = value !== base[index];
              return (
                <Stack key={levelId} sx={{ alignItems: "center" }}>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {level}
                  </Typography>
                  <InputBase
                    value={typing?.levelId === levelId ? typing.text : overridden ? String(value) : ""}
                    placeholder={String(base[index])}
                    onBlur={() => setTyping(null)}
                    onChange={(e) => {
                      setTyping({ levelId, text: e.target.value });
                      // Emptied, it follows its base again; unread, it stays as it was
                      const typed = e.target.value.trim() === "" ? base[index] : readWholeNumber(e.target.value);
                      if (typed !== undefined) onChange({ [levelId]: typed });
                    }}
                    inputProps={{ inputMode: "numeric", "aria-label": `${label}, Level ${level}` }}
                    sx={{
                      width: "100%",
                      border: 1,
                      borderRadius: 0.5,
                      borderColor: overridden ? "secondary.main" : "divider",
                      fontWeight: overridden ? 600 : undefined,
                      "& input": { textAlign: "center", py: 0.25, px: 0 },
                    }}
                  />
                </Stack>
              );
            })}
          </Box>
        </Stack>
      </Box>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
        <Typography variant="body2">Levels</Typography>
        <TextField
          size="small"
          type="number"
          label="From"
          value={range.from}
          onChange={(e) => setRange({ ...range, from: e.target.value })}
          sx={{ width: 80 }}
        />
        <TextField
          size="small"
          type="number"
          label="To"
          value={range.to}
          onChange={(e) => setRange({ ...range, to: e.target.value })}
          sx={{ width: 80 }}
        />
        <TextField
          select
          size="small"
          label="Change"
          value={range.operation}
          onChange={(e) => setRange({ ...range, operation: e.target.value as RangeOperation })}
          sx={{ width: 120 }}
        >
          {RANGE_OPERATIONS.map((operation) => (
            <MenuItem key={operation.value} value={operation.value}>
              {operation.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          type="number"
          label="Amount"
          value={range.amount}
          onChange={(e) => setRange({ ...range, amount: e.target.value })}
          sx={{ width: 90 }}
        />
        <Button variant="outlined" onClick={applyRange}>
          Apply
        </Button>
        <Button onClick={onClose}>Close</Button>
      </Stack>
    </Stack>
  );
}
