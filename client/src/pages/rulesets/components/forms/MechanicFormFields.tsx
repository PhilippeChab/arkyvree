import type { InferRequestType } from "hono/client";
import type { UseFormReturn } from "react-hook-form";

import { DescriptionField, NameField } from "@/client/src/components/common/index.ts";
import { nameRules } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

export type MechanicFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["mechanics"]["$post"]>["json"];

interface MechanicFormFieldsProps {
  form: UseFormReturn<MechanicFormData>;
}

export function MechanicFormFields({ form }: MechanicFormFieldsProps) {
  return (
    <>
      <NameField {...form.register("name", nameRules)} error={form.formState.errors.name} />
      <DescriptionField {...form.register("description")} rows={10} />
    </>
  );
}
