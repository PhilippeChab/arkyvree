import { Alert } from "@mui/material";
import { useController } from "react-hook-form";

import { DiceSpinner } from "@/client/src/components/common/index.ts";

import { AttributeIncreaseField } from "./AttributeIncreaseField.tsx";
import type { LevelUpAttributeStepProps } from "./levelUpFactory.ts";

export function LevelUpAttributeStep({ wizard, baseRules }: LevelUpAttributeStepProps) {
  const { attributeData, isLoadingAttributes, attributesError, control } = wizard;
  const { field } = useController({ control, name: "selectedAttribute" });
  if (isLoadingAttributes) return <DiceSpinner />;
  if (attributesError) return <Alert severity="error">Error loading attributes.</Alert>;
  if (!attributeData?.isAvailable) {
    return <Alert severity="info">No attribute increase at this level.</Alert>;
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
