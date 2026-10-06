import { Button, IconButton, Stack, TextField, Typography } from "@mui/material";
import type { Ref } from "react";

import { DiceIcon } from "@/client/src/components/icons/index.ts";
import { ANIMATIONS } from "@/client/src/lib/animations.ts";

interface HpGainFieldProps {
  title: string;
  hd: number;
  value: number | null;
  onChange: (hp: number | null) => void;
  onRoll: () => void;
  /** While the die rolls: the field shows its faces and waits. */
  rolling?: boolean;
  /** Pulses once the roll lands. */
  settled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onBlur?: () => void;
}

/** A level's hit points: rolled on its hit die, taken at its maximum, or typed in, from 1 to the die's size. */
export function HpGainField({
  title,
  hd,
  value,
  onChange,
  onRoll,
  rolling = false,
  settled = false,
  inputRef,
  onBlur,
}: HpGainFieldProps) {
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Typography component="h3" variant="h6">
          {title}
        </Typography>
        <IconButton onClick={onRoll} disabled={rolling} color="primary" size="small" aria-label={`Roll d${hd}`}>
          <DiceIcon />
        </IconButton>
        <Button size="small" onClick={() => onChange(hd)} disabled={rolling}>
          Max
        </Button>
      </Stack>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Enter HP gain (1 to {hd}). Average: {Math.ceil(hd / 2)}, Maximum: {hd}
      </Typography>
      <TextField
        label="HP Gain"
        type="number"
        value={value ?? ""}
        onChange={(e) => {
          const hp = parseInt(e.target.value, 10);
          onChange(isNaN(hp) ? null : Math.max(1, Math.min(hp, hd)));
        }}
        onBlur={onBlur}
        inputRef={inputRef}
        disabled={rolling}
        fullWidth
        sx={settled ? { animation: ANIMATIONS.settledPulse } : undefined}
        slotProps={{ htmlInput: { min: 1, max: hd, step: 1 } }}
      />
    </Stack>
  );
}
