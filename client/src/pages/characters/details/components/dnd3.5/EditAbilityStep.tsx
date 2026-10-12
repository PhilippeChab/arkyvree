import { type Control, useController } from "react-hook-form";

import { BlankNote, DiceSpinner, LoadError } from "@/client/src/components/common/index.ts";
import type { LevelUpFormData } from "@/client/src/pages/characters/details/components/levelUp/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

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
  baseRules: BaseRules;
  rulesetId: string;
  wizard: EditAbilityState;
}

export function EditAbilityStep({ wizard, baseRules, rulesetId }: EditAbilityStepProps) {
  const { abilityData, isLoadingAbilities, abilitiesError, control } = wizard;
  const { field } = useController({ control, name: "selectedAbility" });
  if (isLoadingAbilities) return <DiceSpinner />;
  if (abilitiesError && !abilityData) return <LoadError what="Abilities" error={abilitiesError} />;
  if (!abilityData?.isAvailable) return <BlankNote>No ability increase at this level</BlankNote>;

  return (
    <AbilityIncreaseField
      abilities={abilityData.attributes}
      baseRules={baseRules}
      rulesetId={rulesetId}
      name="ability-increase"
      value={field.value}
      onChange={field.onChange}
    />
  );
}
