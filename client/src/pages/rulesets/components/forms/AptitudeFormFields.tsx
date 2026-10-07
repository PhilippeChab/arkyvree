import type { InferRequestType } from "hono/client";
import type { UseFormReturn } from "react-hook-form";

import { DescriptionField, NameField } from "@/client/src/components/common/index.ts";
import { NAME_RULES } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

interface AptitudeFormFieldsProps {
  form: UseFormReturn<AptitudeFormData>;
}

export type AptitudeFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["aptitudes"]["$post"]>["json"];

export function AptitudeFormFields({ form }: AptitudeFormFieldsProps) {
  return (
    <>
      <NameField control={form.control} name="name" rules={NAME_RULES} />
      <DescriptionField control={form.control} name="description" />
    </>
  );
}
