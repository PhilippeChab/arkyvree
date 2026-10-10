import { FormTextField } from "@/client/src/components/common/index.ts";
import { wholeNumberRules } from "@/client/src/lib/validation.ts";
import type { NewClassLevelFieldsProps } from "@/client/src/pages/rulesets/details/classes/classFormFactory.ts";

import { ClassLevelFields } from "./ClassLevelFields.tsx";

/**
 * A new 3.5 class level's fields: its base attack bonus and skill points, which only its create sets, then its saves
 * and its granted feats.
 */
export function NewClassLevelFields({ form, rulesetId, rulesetSaves, savesError }: NewClassLevelFieldsProps) {
  return (
    <>
      <FormTextField
        control={form.control}
        name="fields.bab"
        rules={wholeNumberRules(0, "Base Attack Bonus is required")}
        number
        label="Base Attack Bonus"
        fullWidth
        slotProps={{
          htmlInput: { min: 0 },
        }}
      />
      <FormTextField
        control={form.control}
        name="fields.skills"
        rules={wholeNumberRules(1, "Skill points are required")}
        number
        label="Skill Points"
        fullWidth
        slotProps={{
          htmlInput: { min: 1 },
        }}
      />
      <ClassLevelFields form={form} rulesetId={rulesetId} rulesetSaves={rulesetSaves} savesError={savesError} />
    </>
  );
}
