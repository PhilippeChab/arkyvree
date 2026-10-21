import type { FieldValues, UseFormReturn } from "react-hook-form";

import type { RulesetFields } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { useEntityColumns } from "@/client/src/pages/rulesets/hooks/index.ts";

import type { ColumnContext } from "./columnContext.ts";
import { EntityColumns, EntityFields } from "./EntityFields.tsx";

interface EntityFormFieldsProps<T extends FieldValues> {
  /** Its declared fields two side by side past a phone's width (`EntityFields`'s) */
  columns?: 1 | 2;
  context?: ColumnContext;
  entityType: keyof RulesetFields;
  form: UseFormReturn<T>;
  /** Its declared fields each say what they're for under them */
  help?: boolean;
  rulesetId: string;
}

/**
 * An entity's form past its name and description, as its rules describe it: its columns' plain values (a hit die, a
 * cost, a type), the fields its ruleset declares for it, then its columns' lists of links (a spell's aptitudes, a
 * level's saves and feats).
 */
export function EntityFormFields<T extends FieldValues>({
  columns: layout,
  context,
  entityType,
  form,
  help,
  rulesetId,
}: EntityFormFieldsProps<T>) {
  const { columns } = useEntityColumns(rulesetId, entityType);
  return (
    <>
      <EntityColumns columns={columns} context={context} form={form} placement="before" rulesetId={rulesetId} />
      <EntityFields columns={layout} entityType={entityType} form={form} help={help} rulesetId={rulesetId} />
      <EntityColumns columns={columns} context={context} form={form} placement="after" rulesetId={rulesetId} />
    </>
  );
}
