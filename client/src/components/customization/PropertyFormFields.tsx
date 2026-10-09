import type { InferRequestType } from "hono/client";
import { Controller, type UseFormReturn } from "react-hook-form";

import { DescriptionField } from "@/client/src/components/common/index.ts";
import { requiredRules } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import type { CustomizableEntityType } from "@/shared/customization/entities.ts";

import { PropertyTypeInput } from "./PropertyTypeInput.tsx";
import { PropertyValueInput } from "./PropertyValueInput.tsx";

interface PropertyFormFieldsProps {
  /** Suggests the property types used for this entity type. */
  entityType: CustomizableEntityType;
  form: UseFormReturn<PropertyFormData>;
  rulesetId: string;
}

/** A property's fields: its type, its value and its description. */
export type PropertyFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["customization"][":entityType"][":entityId"]["properties"]["$post"]
>["json"];

/** A property's fields, its create dialog's and its edit dialog's alike. */
export function PropertyFormFields({ form, rulesetId, entityType }: PropertyFormFieldsProps) {
  return (
    <>
      <Controller
        control={form.control}
        name="type"
        render={({ field }) => (
          <PropertyTypeInput
            value={field.value || ""}
            onChange={field.onChange}
            inputRef={field.ref}
            rulesetId={rulesetId}
            entityType={entityType}
          />
        )}
      />
      <Controller
        control={form.control}
        name="value"
        rules={requiredRules("Value is required")}
        render={({ field, fieldState }) => (
          <PropertyValueInput
            value={field.value || ""}
            onChange={field.onChange}
            inputRef={field.ref}
            rulesetId={rulesetId}
            propertyType={form.watch("type") || ""}
            error={!!fieldState.error}
            helperText={fieldState.error?.message}
          />
        )}
      />
      <DescriptionField control={form.control} name="description" placeholder="Enter the property description…" />
    </>
  );
}
