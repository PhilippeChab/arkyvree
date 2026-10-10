import { Box, Button, IconButton, Stack, TextField, Typography } from "@mui/material";
import type { Ref } from "react";

import { DiceSpinner, SubsectionTitle } from "@/client/src/components/common/index.ts";
import { CasinoIcon } from "@/client/src/components/icons/index.ts";
import { formatDie } from "@/client/src/lib/formatNumeric.ts";
import { readNumberInput } from "@/client/src/lib/validation.ts";
import { rollDie } from "@/client/src/pages/characters/dice.ts";
import { RollAllButton } from "@/client/src/pages/characters/RollAllButton.tsx";
import { useDiceRoll } from "@/client/src/pages/characters/useDiceRoll.ts";
import { PREFERS_REDUCED_MOTION, settleAnimation } from "@/client/src/theme/animations.ts";

import { hpError, type HpLevel } from "./levelUp/index.ts";

/** The hit points a level wizard hands the HP step: its levels, and their values, which the wizard keeps. */
interface HpState {
  handleHpChange: (index: number, value: number | null) => void;
  /** The HP field's ref, Edit Level's form's (`field.ref`), which its one level's input takes. */
  hpInputRef?: Ref<HTMLInputElement>;
  hpLevels: HpLevel[];
  hpValues: (number | null)[];
}

export interface HpStepProps {
  wizard: HpState;
}

/** The hit points each level gains, Add Level's planned ones or Edit Level's: typed, rolled or the die's most. */
export function HpStep({ wizard }: HpStepProps) {
  const { hpLevels: levels, hpValues, handleHpChange, hpInputRef } = wizard;
  const diceRoll = useDiceRoll();
  // Edit Level's class loads with the level it edits.
  if (levels.length === 0) return <DiceSpinner />;

  const rollLevels = (indexes: number[]) =>
    diceRoll.roll(
      indexes.map((index) => {
        const { max, min } = levels[index].hitPoints;
        return { key: String(index), roll: () => min - 1 + rollDie(max - min + 1) };
      }),
      (key, hp) => handleHpChange(Number(key), hp),
    );

  return (
    // The step's own space under its last field
    <Stack spacing={3} sx={{ pb: 1 }}>
      <Stack direction="row" spacing={1}>
        <RollAllButton onClick={() => rollLevels(levels.map((_, index) => index))} disabled={diceRoll.rolling} />
        <Button
          onClick={() => {
            for (const [index, level] of levels.entries()) handleHpChange(index, level.hitPoints.max);
          }}
          size="small"
          disabled={diceRoll.rolling}
        >
          Max All
        </Button>
      </Stack>
      <Stack spacing={4}>
        {levels.map((level, index) => {
          const value = hpValues[index] ?? null;
          // A level rolling shows its die's faces until it lands
          const face = diceRoll.faceOf(String(index));
          const error = value === null ? undefined : hpError(value, level);
          return (
            <Stack key={index} spacing={2}>
              <Box>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <SubsectionTitle>
                    Set HP for {level.className} Level {level.nextLevel}
                  </SubsectionTitle>
                  <IconButton
                    onClick={() => rollLevels([index])}
                    disabled={diceRoll.rolling}
                    color="primary"
                    size="small"
                    aria-label={`Roll ${formatDie(level.hd)}`}
                  >
                    <CasinoIcon />
                  </IconButton>
                  <Button
                    size="small"
                    onClick={() => handleHpChange(index, level.hitPoints.max)}
                    disabled={diceRoll.rolling}
                  >
                    Max
                  </Button>
                </Stack>
                <Typography variant="body2" sx={{ color: "text.secondary" }} gutterBottom>
                  Enter HP gain ({level.hitPoints.min} to {level.hitPoints.max}). Average: {level.hitPoints.average},
                  Maximum: {level.hitPoints.max}
                </Typography>
              </Box>
              <TextField
                label="HP Gain"
                type="number"
                value={face ?? value ?? ""}
                onChange={(e) => handleHpChange(index, readNumberInput(e.target.value) ?? null)}
                error={!!error}
                helperText={error}
                inputRef={index === 0 ? hpInputRef : undefined}
                disabled={face !== undefined}
                fullWidth
                sx={{
                  animation: diceRoll.hasLanded(String(index)) ? settleAnimation : undefined,
                  [PREFERS_REDUCED_MOTION]: { animation: "none" },
                }}
                slotProps={{ htmlInput: { min: level.hitPoints.min, max: level.hitPoints.max, step: 1 } }}
              />
            </Stack>
          );
        })}
      </Stack>
    </Stack>
  );
}
