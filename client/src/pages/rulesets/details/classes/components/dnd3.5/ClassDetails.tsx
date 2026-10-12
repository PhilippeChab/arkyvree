import { ClassFormFields } from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import type { ClassDetailsProps } from "@/client/src/pages/rulesets/details/classes/classSectionFactory.ts";

/** A 3.5 class's details: its form's fields (its hit die, its bonus spell ability, its caster type), and their save. */
export function ClassDetails({ rulesetId, edit }: ClassDetailsProps) {
  return (
    <EntityDetailsCard
      title="Class Details"
      form={{
        fields: <ClassFormFields form={edit.form} rulesetId={rulesetId} />,
        onSubmit: edit.onSubmit,
        canSave: edit.canSave,
        isSaving: edit.isSaving,
      }}
    />
  );
}
