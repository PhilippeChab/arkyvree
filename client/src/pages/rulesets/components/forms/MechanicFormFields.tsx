import type { InferRequestType } from "hono/client";
import type { UseFormReturn } from "react-hook-form";

import { DescriptionField, NameField } from "@/client/src/components/common/index.ts";
import { nameRules } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

interface MechanicFormFieldsProps {
  form: UseFormReturn<MechanicFormData>;
}

export type MechanicFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["mechanics"]["$post"]>["json"];

export function MechanicFormFields({ form }: MechanicFormFieldsProps) {
  return (
    <>
      <NameField control={form.control} name="name" rules={nameRules} />
      <DescriptionField control={form.control} name="description" rows={10} />
    </>
  );
}
