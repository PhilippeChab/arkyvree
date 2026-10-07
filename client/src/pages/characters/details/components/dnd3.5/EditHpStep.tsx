import { Box, Button, IconButton, Stack, TextField, Typography } from "@mui/material";
import { type Control, useController } from "react-hook-form";

import { DiceSpinner, SubsectionTitle } from "@/client/src/components/common/index.ts";
import { CasinoIcon } from "@/client/src/components/icons/index.ts";
import { PREFERS_REDUCED_MOTION, settleAnimation } from "@/client/src/theme/animations.ts";

import type { LevelUpFormData, SelectedKlass } from "./levelUp/index.ts";

interface EditHpState {
  /** The picks' form: the HP field. */
  control: Control<LevelUpFormData>;
  hpDisplayValue: number | null;
  hpRolling: boolean;
  hpSettled: boolean;
  selectedClass: SelectedKlass | null;
  triggerHpRoll: (hd: number) => void;
}

export interface EditHpStepProps {
  wizard: EditHpState;
}

export function EditHpStep({ wizard }: EditHpStepProps) {
  const { selectedClass, control, hpRolling, hpSettled, hpDisplayValue, triggerHpRoll } = wizard;
  const { field } = useController({ control, name: "selectedHP" });
  // The level's class loads with the level being edited.
  if (!selectedClass) return <DiceSpinner />;

  return (
    // The step's own space under its field
    <Stack spacing={2} sx={{ pb: 1 }}>
      <Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <SubsectionTitle>Set HP for Level {selectedClass.nextLevel}</SubsectionTitle>
          <IconButton
            onClick={() => triggerHpRoll(selectedClass.hd)}
            disabled={hpRolling}
            color="primary"
            size="small"
            aria-label={`Roll d${selectedClass.hd}`}
          >
            <CasinoIcon />
          </IconButton>
          <Button size="small" onClick={() => field.onChange(selectedClass.hd)} disabled={hpRolling}>
            Max
          </Button>
        </Stack>
        <Typography variant="body2" sx={{ color: "text.secondary" }} gutterBottom>
          Enter HP gain (1 to {selectedClass.hd}). Average: {Math.ceil(selectedClass.hd / 2)}, Maximum:{" "}
          {selectedClass.hd}
        </Typography>
      </Box>
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
        sx={{ animation: hpSettled ? settleAnimation : undefined, [PREFERS_REDUCED_MOTION]: { animation: "none" } }}
        slotProps={{
          htmlInput: {
            min: 1,
            max: selectedClass.hd,
            step: 1,
          },
        }}
      />
    </Stack>
  );
}
