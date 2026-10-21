import type { InferRequestType } from "hono/client";
import type { UseFormReturn } from "react-hook-form";

import { DescriptionField, NameField } from "@/client/src/components/common/index.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

import { EntityFormFields } from "./EntityFormFields.tsx";

interface RaceFormFieldsProps {
  form: UseFormReturn<RaceFormData>;
  rulesetId: string;
}

export type RaceFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["races"]["$post"]>["json"];

/** A race's name and description, then its columns and fields as its rules describe them (3.5's size and speed). */
export function RaceFormFields({ form, rulesetId }: RaceFormFieldsProps) {
  return (
    <>
      <NameField control={form.control} name="name" />
      <DescriptionField control={form.control} name="description" />
      <EntityFormFields form={form} entityType="races" rulesetId={rulesetId} />
    </>
  );
}
