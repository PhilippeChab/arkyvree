import { FitnessCenter as AbilitiesIcon } from "@mui/icons-material";
import { useController } from "react-hook-form";

import { BlankState, DiceSpinner, LoadError } from "@/client/src/components/common/index.ts";

import { AttributeIncreaseField } from "./AttributeIncreaseField.tsx";
import type { LevelUpAttributeStepProps } from "./levelUpFactory.ts";

export function LevelUpAttributeStep({ wizard, baseRules }: LevelUpAttributeStepProps) {
  const { attributeData, isLoadingAttributes, attributesError, control } = wizard;
  const { field } = useController({ control, name: "selectedAttribute" });
  if (isLoadingAttributes) return <DiceSpinner />;
  if (attributesError) return <LoadError what="Attributes" error={attributesError} />;
  if (!attributeData?.isAvailable) {
    return <BlankState icon={AbilitiesIcon} title="No attribute increase at this level" />;
  }

  return (
    <AttributeIncreaseField
      attributes={attributeData.attributes}
      baseRules={baseRules}
      name="attribute"
      value={field.value}
      onChange={field.onChange}
    />
  );
}
