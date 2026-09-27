import type { LevelUpAttributeStepProps } from "./levelUpFactory.ts";
import { DiceSpinner } from "@/client/src/components/common/index.ts";
import { Alert } from "@mui/material";
import { AttributeIncreaseField } from "./AttributeIncreaseField.tsx";

export function LevelUpAttributeStep({
  wizard,
  baseRules,
}: LevelUpAttributeStepProps) {
  const {
    attributeData,
    isLoadingAttributes,
    attributesError,
    selectedAttribute,
    setValue,
  } = wizard;
  if (isLoadingAttributes) return <DiceSpinner />;
  if (attributesError)
    return <Alert severity="error">Error loading attributes.</Alert>;
  if (!attributeData?.isAvailable) {
    return (
      <Alert severity="info">No attribute increase at this level.</Alert>
    );
  }

  return (
    <AttributeIncreaseField
      attributes={attributeData.attributes}
      baseRules={baseRules}
      name="attribute"
      value={selectedAttribute}
      onChange={(abilityId) => setValue("selectedAttribute", abilityId)}
    />
  );
}
