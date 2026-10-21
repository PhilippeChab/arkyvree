import type { InferRequestType } from "hono/client";
import type { UseFormReturn } from "react-hook-form";

import { DescriptionField, NameField } from "@/client/src/components/common/index.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

import type { ColumnContext } from "./columnContext.ts";
import { EntityFormFields } from "./EntityFormFields.tsx";

interface PowerFormFieldsProps {
  /** The aptitudes it holds, and whether it's new (a new one needs an aptitude) */
  context?: ColumnContext;
  form: UseFormReturn<PowerFormData>;
  rulesetId: string;
}

export type PowerFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["powers"]["$post"]>["json"];

/**
 * A power's name and description, then its columns and fields as its rules describe them (a 3.5 spell's save, its
 * fields two side by side, then its spell lists, each at its spell level).
 */
export function PowerFormFields({ context, form, rulesetId }: PowerFormFieldsProps) {
  return (
    <>
      <NameField control={form.control} name="name" />
      <DescriptionField control={form.control} name="description" />
      <EntityFormFields form={form} entityType="powers" rulesetId={rulesetId} columns={2} context={context} />
    </>
  );
}
