import { type Control, useController } from "react-hook-form";

import { BlankNote, DiceSpinner, LoadError } from "@/client/src/components/common/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

import { AttributeIncreaseField } from "./AttributeIncreaseField.tsx";
import type { AttributesData, LevelUpFormData } from "./levelUp/index.ts";

interface EditAttributeState {
  attributeData: AttributesData | undefined;
  attributesError: Error | null;
  /** The picks' form: the attribute field. */
  control: Control<LevelUpFormData>;
  isLoadingAttributes: boolean;
}

export interface EditAttributeStepProps {
  baseRules: BaseRules;
  wizard: EditAttributeState;
}

export function EditAttributeStep({ wizard, baseRules }: EditAttributeStepProps) {
  const { attributeData, isLoadingAttributes, attributesError, control } = wizard;
  const { field } = useController({ control, name: "selectedAttribute" });
  if (isLoadingAttributes) return <DiceSpinner />;
  if (attributesError && !attributeData) return <LoadError what="Attributes" error={attributesError} />;
  if (!attributeData?.isAvailable) return <BlankNote>No attribute increase at this level</BlankNote>;

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
