import { type Control, useController } from "react-hook-form";

import { BlankNote, DiceSpinner, LoadError } from "@/client/src/components/common/index.ts";
import type { LevelUpFormData } from "@/client/src/pages/characters/details/components/levelUp/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

import { AbilityIncreaseField } from "./AbilityIncreaseField.tsx";
import type { AttributesData } from "./levelUp/index.ts";

interface EditAbilityState {
  attributeData: AttributesData | undefined;
  attributesError: Error | null;
  /** The picks' form: the ability field. */
  control: Control<LevelUpFormData>;
  isLoadingAttributes: boolean;
}

interface EditAbilityStepProps {
  baseRules: BaseRules;
  wizard: EditAbilityState;
}

export function EditAbilityStep({ wizard, baseRules }: EditAbilityStepProps) {
  const { attributeData, isLoadingAttributes, attributesError, control } = wizard;
  const { field } = useController({ control, name: "selectedAttribute" });
  if (isLoadingAttributes) return <DiceSpinner />;
  if (attributesError && !attributeData) return <LoadError what="Abilities" error={attributesError} />;
  if (!attributeData?.isAvailable) return <BlankNote>No ability increase at this level</BlankNote>;

  return (
    <AbilityIncreaseField
      abilities={attributeData.attributes}
      baseRules={baseRules}
      name="ability-increase"
      value={field.value}
      onChange={field.onChange}
    />
  );
}
