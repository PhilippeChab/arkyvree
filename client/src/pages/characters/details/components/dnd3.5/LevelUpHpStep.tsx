import type { LevelUpHpStepProps } from "./levelUpFactory.ts";
import { settledPulse } from "@/client/src/lib/animations.ts";
import { Casino as CasinoIcon } from "@mui/icons-material";
import { DiceSpinner } from "@/client/src/components/common/index.ts";
import { Alert, Box, Chip, IconButton, Stack, TextField, Typography } from "@mui/material";

export function LevelUpHpStep({
  selectedClass,
  selectedHP,
  isEditing,
  hpRolling,
  hpSettled,
  hpDisplayValue,
  triggerHpRoll,
  setValue,
}: LevelUpHpStepProps) {
  if (!selectedClass) {
    if (isEditing) return <DiceSpinner />;
    return <Alert severity="error">Please select a class first.</Alert>;
  }

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{
        alignItems: "center"
      }}>
        <Typography variant="h6">
          Set HP for Level {selectedClass.nextLevel}
        </Typography>
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
          onClick={() => setValue("selectedHP", selectedClass.hd)}
          disabled={hpRolling}
        />
      </Stack>
      <Typography variant="body2" color="textSecondary" gutterBottom>
        Enter HP gain (1 to {selectedClass.hd}). Average:{" "}
        {Math.ceil(selectedClass.hd / 2)}, Maximum: {selectedClass.hd}
      </Typography>
      <TextField
        label="HP Gain"
        type="number"
        value={hpRolling ? hpDisplayValue || "" : selectedHP || ""}
        onChange={(e) => {
          const value = parseInt(e.target.value);
          if (isNaN(value)) {
            setValue("selectedHP", null);
          } else {
            setValue(
              "selectedHP",
              Math.max(1, Math.min(value, selectedClass.hd)),
            );
          }
        }}
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
          }
        }}
      />
    </Box>
  );
}
