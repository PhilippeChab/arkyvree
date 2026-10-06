import { Box, Button, Chip, IconButton, Stack, TextField, Typography } from "@mui/material";

import { DiceIcon } from "@/client/src/components/icons/index.ts";

import type { AddHpStepProps } from "./levelUpFactory.ts";

export function AddHpStep({ wizard }: AddHpStepProps) {
  const {
    hpLevels: levels,
    hpValues,
    handleHpChange: onHpChange,
    handleHpRoll: onRoll,
    handleHpRollAll: onRollAll,
    handleHpMaxAll: onMaxAll,
  } = wizard;
  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={1}>
        <Button startIcon={<DiceIcon />} onClick={onRollAll} size="small">
          Roll All
        </Button>
        <Button onClick={onMaxAll} size="small">
          Max All
        </Button>
      </Stack>
      {levels.map((level, index) => (
        <Box key={index}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Typography variant="h6">
              Set HP for {level.className} Level {level.nextLevel}
            </Typography>
            <IconButton onClick={() => onRoll(index)} color="primary" size="small" aria-label={`Roll d${level.hd}`}>
              <DiceIcon />
            </IconButton>
            <Chip label="MAX" size="small" variant="outlined" onClick={() => onHpChange(index, level.hd)} />
          </Stack>
          <Typography variant="body2" sx={{ color: "text.secondary" }} gutterBottom>
            Enter HP gain (1 to {level.hd}). Average: {Math.ceil(level.hd / 2)}, Maximum: {level.hd}
          </Typography>
          <TextField
            label="HP Gain"
            type="number"
            value={hpValues[index] ?? ""}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              onHpChange(index, isNaN(val) ? null : Math.max(1, Math.min(val, level.hd)));
            }}
            fullWidth
            margin="normal"
            slotProps={{
              htmlInput: { min: 1, max: level.hd, step: 1 },
            }}
          />
        </Box>
      ))}
    </Stack>
  );
}
