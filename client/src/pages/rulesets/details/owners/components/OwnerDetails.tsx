import type { FormEventHandler } from "react";
import type { UseFormReturn } from "react-hook-form";

import { type EntityFormData, RulesetEntityFormFields } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";

/**
 * What the owner's page passes its details card: the owner's form and its save, which a viewer who can't edit the owner
 * reads (under `ReadOnlyFields`), and its ruleset.
 */
interface OwnerDetailsProps {
  /** The owner's form, which the card's fields bind, and its save */
  edit: OwnerEditor;
  /** Its kind (3.5's `classes`), whose columns and fields its form shows */
  ownerType: string;
  rulesetId: string;
  /** Its kind's word ("Class") */
  word: string;
}

/** An owner's inline form: what the details card's fields bind, and its save. */
interface OwnerEditor {
  canSave: boolean;
  form: UseFormReturn<EntityFormData>;
  isSaving: boolean;
  onSubmit: FormEventHandler;
}

/**
 * An owner's details: its form's fields, its columns and fields as its rules describe them (3.5's hit die, bonus spell
 * ability, caster type), and their save.
 */
export function OwnerDetails({ ownerType, rulesetId, edit, word }: OwnerDetailsProps) {
  return (
    <EntityDetailsCard
      title={`${word} Details`}
      form={{
        fields: <RulesetEntityFormFields form={edit.form} entityType={ownerType} rulesetId={rulesetId} help />,
        onSubmit: edit.onSubmit,
        canSave: edit.canSave,
        isSaving: edit.isSaving,
      }}
    />
  );
}
