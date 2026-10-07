import { Box, Button, IconButton, Stack, TextField, Typography } from "@mui/material";

import { RollAllButton } from "@/client/src/components/characters/index.ts";
import { SubsectionTitle } from "@/client/src/components/common/index.ts";
import { CasinoIcon } from "@/client/src/components/icons/index.ts";

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
    // The step's own space under its last field
    <Stack spacing={3} sx={{ pb: 1 }}>
      <Stack direction="row" spacing={1}>
        <RollAllButton onClick={onRollAll} />
        <Button onClick={onMaxAll} size="small">
          Max All
        </Button>
      </Stack>
      <Stack spacing={4}>
        {levels.map((level, index) => (
          <Stack key={index} spacing={2}>
            <Box>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <SubsectionTitle>
                  Set HP for {level.className} Level {level.nextLevel}
                </SubsectionTitle>
                <IconButton onClick={() => onRoll(index)} color="primary" size="small" aria-label={`Roll d${level.hd}`}>
                  <CasinoIcon />
                </IconButton>
                <Button size="small" onClick={() => onHpChange(index, level.hd)}>
                  Max
                </Button>
              </Stack>
              <Typography variant="body2" sx={{ color: "text.secondary" }} gutterBottom>
                Enter HP gain (1 to {level.hd}). Average: {Math.ceil(level.hd / 2)}, Maximum: {level.hd}
              </Typography>
            </Box>
            <TextField
              label="HP Gain"
              type="number"
              value={hpValues[index] ?? ""}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                onHpChange(index, isNaN(val) ? null : Math.max(1, Math.min(val, level.hd)));
              }}
              fullWidth
              slotProps={{
                htmlInput: { min: 1, max: level.hd, step: 1 },
              }}
            />
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}
