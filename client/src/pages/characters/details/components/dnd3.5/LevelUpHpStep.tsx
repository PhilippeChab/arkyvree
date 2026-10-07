import { Box, Chip, IconButton, Stack, TextField, Typography } from "@mui/material";
import { useController } from "react-hook-form";

import { DiceSpinner } from "@/client/src/components/common/index.ts";
import { CasinoIcon } from "@/client/src/components/icons/index.ts";
import { settledPulse } from "@/client/src/lib/animations.ts";

import type { LevelUpHpStepProps } from "./levelUpFactory.ts";

export function LevelUpHpStep({ wizard }: LevelUpHpStepProps) {
  const { selectedClass, control, hpRolling, hpSettled, hpDisplayValue, triggerHpRoll } = wizard;
  const { field } = useController({ control, name: "selectedHP" });
  // The level's class loads with the level being edited.
  if (!selectedClass) return <DiceSpinner />;

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Typography variant="h6">Set HP for Level {selectedClass.nextLevel}</Typography>
        <IconButton
          onClick={() => triggerHpRoll(selectedClass.hd)}
          disabled={hpRolling}
          color="primary"
          size="small"
          aria-label={`Roll d${selectedClass.hd}`}
        >
          <CasinoIcon />
        </IconButton>
        <Chip
          label="MAX"
          size="small"
          variant="outlined"
          onClick={() => field.onChange(selectedClass.hd)}
          disabled={hpRolling}
        />
      </Stack>
      <Typography variant="body2" sx={{ color: "text.secondary" }} gutterBottom>
        Enter HP gain (1 to {selectedClass.hd}). Average: {Math.ceil(selectedClass.hd / 2)}, Maximum: {selectedClass.hd}
      </Typography>
      <TextField
        label="HP Gain"
        type="number"
        value={hpRolling ? hpDisplayValue || "" : field.value || ""}
        onChange={(e) => {
          const value = parseInt(e.target.value);
          field.onChange(isNaN(value) ? null : Math.max(1, Math.min(value, selectedClass.hd)));
        }}
        onBlur={field.onBlur}
        inputRef={field.ref}
        disabled={hpRolling}
        fullWidth
        margin="normal"
        sx={{
          ...(hpSettled && {
            animation: `${settledPulse} 0.4s cubic-bezier(0.4, 0, 0.2, 1)`,
          }),
        }}
        slotProps={{
          htmlInput: {
            min: 1,
            max: selectedClass.hd,
            step: 1,
          },
        }}
      />
    </Box>
  );
}
