import { useController } from "react-hook-form";

import { DiceSpinner } from "@/client/src/components/common/index.ts";

import { HpGainField } from "./HpGainField.tsx";
import type { LevelUpHpStepProps } from "./levelUpFactory.ts";

export function LevelUpHpStep({ wizard }: LevelUpHpStepProps) {
  const { selectedClass, control, hpRolling, hpSettled, hpDisplayValue, triggerHpRoll } = wizard;
  const { field } = useController({ control, name: "selectedHP" });
  // The level's class loads with the level being edited.
  if (!selectedClass) return <DiceSpinner />;

  return (
    <HpGainField
      title={`Set HP for Level ${selectedClass.nextLevel}`}
      hd={selectedClass.hd}
      value={(hpRolling ? hpDisplayValue : field.value) || null}
      onChange={field.onChange}
      onRoll={() => triggerHpRoll(selectedClass.hd)}
      rolling={hpRolling}
      settled={hpSettled}
      inputRef={field.ref}
      onBlur={field.onBlur}
    />
  );
}
