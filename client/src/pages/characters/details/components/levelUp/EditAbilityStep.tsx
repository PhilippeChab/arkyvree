import { type Control, useController } from "react-hook-form";

import { BlankNote, DiceSpinner, LoadError } from "@/client/src/components/common/index.ts";

import { AbilityIncreaseField } from "./AbilityIncreaseField.tsx";
import type { AbilitiesData } from "./levelAnswers.ts";
import { useCharacterRules } from "./useCharacterRules.ts";
import type { LevelUpFormData } from "./useLevelWizardBase.ts";

interface EditAbilityState {
  abilitiesError: Error | null;
  abilityData: AbilitiesData | undefined;
  /** The picks' form: the ability field. */
  control: Control<LevelUpFormData>;
  isLoadingAbilities: boolean;
}

interface EditAbilityStepProps {
  characterId: string;
  wizard: EditAbilityState;
}

export function EditAbilityStep({ characterId, wizard }: EditAbilityStepProps) {
  // Its rules' word for an ability increase, and what its picker asks
  const increase = useCharacterRules(characterId).rules?.levelUp.abilityIncrease;
  const { abilityData, isLoadingAbilities, abilitiesError, control } = wizard;
  const { field } = useController({ control, name: "selectedAbility" });
  if (isLoadingAbilities) return <DiceSpinner />;
  if (abilitiesError && !abilityData) return <LoadError what="Abilities" error={abilitiesError} />;
  if (!abilityData?.isAvailable) return <BlankNote>No {increase?.word.one.toLowerCase()} at this level</BlankNote>;

  return (
    <AbilityIncreaseField
      prompt={increase?.prompt}
      abilities={abilityData.attributes}
      name="ability-increase"
      value={field.value}
      onChange={field.onChange}
    />
  );
}
