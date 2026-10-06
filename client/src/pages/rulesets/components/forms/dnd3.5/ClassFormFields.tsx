import { MenuItem } from "@mui/material";
import type { InferRequestType } from "hono/client";
import type { UseFormReturn } from "react-hook-form";

import { DescriptionField, FormTextField, NameField } from "@/client/src/components/common/index.ts";
import { nameRules } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import { HIT_DIE_VALUES } from "@/shared/dnd3.5/classes.ts";

interface ClassFormFieldsProps {
  form: UseFormReturn<ClassFormData>;
}

export type ClassFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["classes"]["$post"]>["json"];

export function ClassFormFields({ form }: ClassFormFieldsProps) {
  return (
    <>
      <NameField control={form.control} name="name" rules={nameRules} />
      <DescriptionField control={form.control} name="description" />
      <FormTextField control={form.control} name="hd" number label="Hit Die" select fullWidth>
        {HIT_DIE_VALUES.map((v) => (
          <MenuItem key={v} value={v}>{`d${v}`}</MenuItem>
        ))}
      </FormTextField>
    </>
  );
}
