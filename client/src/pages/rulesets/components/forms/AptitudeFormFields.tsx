import type { InferRequestType } from "hono/client";
import type { UseFormReturn } from "react-hook-form";

import { DescriptionField, NameField } from "@/client/src/components/common/index.ts";
import { nameRules } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

export type AptitudeFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["aptitudes"]["$post"]>["json"];

export function AptitudeFormFields({ form }: { form: UseFormReturn<AptitudeFormData> }) {
  return (
    <>
      <NameField {...form.register("name", nameRules)} error={form.formState.errors.name} />
      <DescriptionField {...form.register("description")} />
    </>
  );
}
