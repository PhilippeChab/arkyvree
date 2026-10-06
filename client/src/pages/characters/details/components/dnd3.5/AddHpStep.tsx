import { Button, Stack } from "@mui/material";

import { DiceIcon } from "@/client/src/components/icons/index.ts";

import { HpGainField } from "./HpGainField.tsx";
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
        <HpGainField
          key={index}
          title={`Set HP for ${level.className} Level ${level.nextLevel}`}
          hd={level.hd}
          value={hpValues[index] ?? null}
          onChange={(hp) => onHpChange(index, hp)}
          onRoll={() => onRoll(index)}
        />
      ))}
    </Stack>
  );
}
