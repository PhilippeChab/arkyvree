import { useController } from "react-hook-form";

import { BlankNote, DiceSpinner, LoadError } from "@/client/src/components/common/index.ts";

import { AttributeIncreaseField } from "./AttributeIncreaseField.tsx";
import type { LevelUpAttributeStepProps } from "./levelUpFactory.ts";

export function LevelUpAttributeStep({ wizard, baseRules }: LevelUpAttributeStepProps) {
  const { attributeData, isLoadingAttributes, attributesError, control } = wizard;
  const { field } = useController({ control, name: "selectedAttribute" });
  if (isLoadingAttributes) return <DiceSpinner />;
  if (attributesError && !attributeData) return <LoadError what="Attributes" error={attributesError} />;
  if (!attributeData?.isAvailable) return <BlankNote>No attribute increase at this level.</BlankNote>;

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
