import type { FormEventHandler } from "react";
import type { UseFormReturn } from "react-hook-form";

import { type EntityFormData, RulesetEntityFormFields } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";

/**
 * What the class page passes its details card: the class's form and its save, which a viewer who can't edit the class
 * reads (under `ReadOnlyFields`), and its ruleset.
 */
interface ClassDetailsProps {
  /** The class's form, which the card's fields bind, and its save */
  edit: ClassEditor;
  rulesetId: string;
}

/** A class's inline form: what the details card's fields bind, and its save. */
interface ClassEditor {
  canSave: boolean;
  form: UseFormReturn<EntityFormData>;
  isSaving: boolean;
  onSubmit: FormEventHandler;
}

/**
 * A class's details: its form's fields, its columns and fields as its rules describe them (3.5's hit die, bonus spell
 * ability, caster type), and their save.
 */
export function ClassDetails({ rulesetId, edit }: ClassDetailsProps) {
  return (
    <EntityDetailsCard
      title="Class Details"
      form={{
        fields: <RulesetEntityFormFields form={edit.form} entityType="klasses" rulesetId={rulesetId} help />,
        onSubmit: edit.onSubmit,
        canSave: edit.canSave,
        isSaving: edit.isSaving,
      }}
    />
  );
}
