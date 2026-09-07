import { Box, Button, Chip, IconButton, Stack, TextField, Typography } from "@mui/material";
import { Casino as CasinoIcon } from "@mui/icons-material";
import type { AddHpStepProps } from "./levelUpFactory.ts";

export function AddHpStep({
  levels,
  hpValues,
  onHpChange,
  onRoll,
  onRollAll,
  onMaxAll,
}: AddHpStepProps) {
  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button startIcon={<CasinoIcon />} onClick={onRollAll} size="small">
          Roll All
        </Button>
        <Button onClick={onMaxAll} size="small">
          Max All
        </Button>
      </Box>
      {levels.map((level, index) => (
        <Box key={index}>
          <Stack direction="row" spacing={1} sx={{
            alignItems: "center"
          }}>
            <Typography variant="h6">
              Set HP for {level.className} Level {level.nextLevel}
            </Typography>
            <IconButton
              onClick={() => onRoll(index)}
              color="primary"
              size="small"
              aria-label={`Roll d${level.hd}`}
            >
              <CasinoIcon />
            </IconButton>
            <Chip
              label="MAX"
              size="small"
              variant="outlined"
              onClick={() => onHpChange(index, level.hd)}
            />
          </Stack>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Enter HP gain (1 to {level.hd}). Average:{" "}
            {Math.ceil(level.hd / 2)}, Maximum: {level.hd}
          </Typography>
          <TextField
            label="HP Gain"
            type="number"
            value={hpValues[index] ?? ""}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              onHpChange(
                index,
                isNaN(val) ? null : Math.max(1, Math.min(val, level.hd)),
              );
            }}
            fullWidth
            margin="normal"
            slotProps={{
              htmlInput: { min: 1, max: level.hd, step: 1 }
            }}
          />
        </Box>
      ))}
    </Stack>
  );
}
