import { Box, Button, InputBase, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { type ReactNode, useState } from "react";

import type { PositionWord } from "@/client/src/lib/rulesetLabels.ts";

import { readWholeNumber } from "./progressionDraft.ts";
import type { OwnedValue } from "./progressionPresets.ts";

interface CustomTrackEditorProps {
  /**
   * What the owned entities follow until one differs: a preset's values, or a number at every owned entity, aligned
   * with `values`
   */
  base: readonly number[];
  /** Its choice of what the owned entities follow (a preset), before its hint */
  baseControl?: ReactNode;
  /** What the track's inputs say they are ("Reflex", "Skill points") */
  label: string;
  /** The highest value the rules take, which a typed or applied one past it is set back to */
  max: number;
  /** The lowest value the rules take, which a typed or applied one below it is set back to */
  min: number;
  onChange: (values: Record<string, number>) => void;
  onClose: () => void;
  /** Its owner kind's word, as a sentence says it ("class") */
  ownerWord: string;
  /**
   * Its rules' word for an owned entity's position along its owner, which names one ("Level 3"), and several ("Levels")
   */
  positionWord: PositionWord;
  values: readonly OwnedValue[];
}

/** An operation a position range applies: a value at every owned entity of it, or one added to or taken from each. */
type RangeOperation = "add" | "set" | "subtract";

/** The operations a position range applies, as its menu lists them. */
const RANGE_OPERATIONS: { label: string; value: RangeOperation }[] = [
  { label: "set to", value: "set" },
  { label: "add", value: "add" },
  { label: "subtract", value: "subtract" },
];

/** A typed value: a whole number, 0 at least, or its fallback when it isn't one. */
function readWholeInput(text: string, fallback: number) {
  return readWholeNumber(text) ?? fallback;
}

/**
 * A track's values one owned entity at a time, for an owner whose track follows no preset: each owned entity that
 * follows its base shows the base greyed, so only the owned entities that differ are typed, and a bar an owned entity
 * shows its shape, an override in gold. A position range sets, adds to or takes from every owned entity in it at once.
 */
export function CustomTrackEditor({
  base,
  baseControl,
  label,
  max,
  min,
  onChange,
  onClose,
  ownerWord,
  positionWord,
  values,
}: CustomTrackEditorProps) {
  // The range's fields as typed, read when it's applied
  const [range, setRange] = useState({
    from: "1",
    to: String(values.at(-1)?.position ?? 1),
    operation: "set" as RangeOperation,
    amount: "0",
  });
  // An owned entity's input as typed (an emptied one before its new number), until it's left
  const [typing, setTyping] = useState<{ ownedId: string; text: string } | null>(null);
  const highest = Math.max(1, ...values.map(({ value }) => value), ...base);

  const applyRange = () => {
    const [start, end, amount] = [
      readWholeInput(range.from, 1),
      readWholeInput(range.to, 1),
      readWholeInput(range.amount, 0),
    ];
    const [from, to] = [Math.min(start, end), Math.max(start, end)];
    const changed = values.filter(({ position }) => position >= from && position <= to);
    const next = (value: number) =>
      range.operation === "set" ? amount : value + (range.operation === "add" ? amount : -amount);
    onChange(
      Object.fromEntries(changed.map(({ ownedId, value }) => [ownedId, Math.min(max, Math.max(min, next(value)))])),
    );
  };

  return (
    <Stack
      spacing={1.5}
      sx={{ p: 2, borderRadius: 1, border: 1, borderColor: "divider", bgcolor: "background.default" }}
    >
      <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
        {baseControl}
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {`Greyed ${positionWord.many.toLowerCase()} follow it: type only where this ${ownerWord} differs.`}
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
            {values.map(({ ownedId, value }, index) => (
              <Box
                key={ownedId}
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
            {values.map(({ position, ownedId, value }, index) => {
              const overridden = value !== base[index];
              return (
                <Stack key={ownedId} sx={{ alignItems: "center" }}>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {position}
                  </Typography>
                  <InputBase
                    value={typing?.ownedId === ownedId ? typing.text : overridden ? String(value) : ""}
                    placeholder={String(base[index])}
                    onBlur={() => setTyping(null)}
                    onChange={(e) => {
                      // Emptied, it follows its base again; unread, it stays as it was; past a bound, it shows the
                      // bound
                      const read = e.target.value.trim() === "" ? base[index] : readWholeNumber(e.target.value);
                      const typed = read === undefined ? undefined : Math.max(min, Math.min(read, max));
                      setTyping({ ownedId, text: typed !== read ? String(typed) : e.target.value });
                      if (typed !== undefined) onChange({ [ownedId]: typed });
                    }}
                    inputProps={{ inputMode: "numeric", "aria-label": `${label}, ${positionWord.one} ${position}` }}
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
        <Typography variant="body2">{positionWord.many}</Typography>
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
          Set {positionWord.many}
        </Button>
        <Button onClick={onClose}>Close</Button>
      </Stack>
    </Stack>
  );
}
