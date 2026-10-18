import { type Control, useController } from "react-hook-form";

import { BlankNote, DiceSpinner, LoadError } from "@/client/src/components/common/index.ts";
import type { LevelUpFormData } from "@/client/src/pages/characters/details/components/levelUp/index.ts";

import { AbilityIncreaseField } from "./AbilityIncreaseField.tsx";
import type { AbilitiesData } from "./levelUp/index.ts";

interface EditAbilityState {
  abilitiesError: Error | null;
  abilityData: AbilitiesData | undefined;
  /** The picks' form: the ability field. */
  control: Control<LevelUpFormData>;
  isLoadingAbilities: boolean;
}

interface EditAbilityStepProps {
  wizard: EditAbilityState;
}

export function EditAbilityStep({ wizard }: EditAbilityStepProps) {
  const { abilityData, isLoadingAbilities, abilitiesError, control } = wizard;
  const { field } = useController({ control, name: "selectedAbility" });
  if (isLoadingAbilities) return <DiceSpinner />;
  if (abilitiesError && !abilityData) return <LoadError what="Abilities" error={abilitiesError} />;
  if (!abilityData?.isAvailable) return <BlankNote>No ability increase at this level</BlankNote>;

  return (
    <AbilityIncreaseField
      abilities={abilityData.attributes}
      name="ability-increase"
      value={field.value}
      onChange={field.onChange}
    />
  );
}
