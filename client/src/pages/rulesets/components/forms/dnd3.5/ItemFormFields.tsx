import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { type UseFormReturn } from "react-hook-form";

import { DescriptionField, FormTextField, NameField, SelectField } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { NO_TIME } from "@/client/src/lib/durations.ts";
import { DECIMAL_RULES } from "@/client/src/lib/validation.ts";
import {
  emptyFieldValues,
  ownFieldValues,
  toFieldValues,
} from "@/client/src/pages/rulesets/components/forms/entityFields.ts";
import { EntityFields } from "@/client/src/pages/rulesets/components/forms/EntityFields.tsx";
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { useEntityFields } from "@/client/src/pages/rulesets/hooks/index.ts";
import { itemTemplatesQuery } from "@/client/src/pages/rulesets/optionQueries.ts";
import { LOCATION_OPTIONS } from "@/shared/enums.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { TEMPLATE_ITEM_TYPES, type TemplateItemType } from "@/vocabulary/dnd3.5/itemTemplates.ts";

import { fieldsClearedByType, ITEM_TYPE_OPTIONS, type ItemFormData, templateOptions } from "./itemForm.ts";

interface ItemFormFieldsProps {
  form: UseFormReturn<ItemFormData>;
  /** Keeps the type, slot and template as they are (a duplicate copies them from its source). */
  lockType?: boolean;
  /**
   * A new item's form (the create dialog), which sends every field: a type change drops the template's values it holds.
   * A saved item's sends those it changed, and its save drops its template's and keeps its own.
   */
  newItem?: boolean;
  rulesetId: string;
  /** The name of the template the item was saved with, which its select shows while it isn't one of the item's type. */
  templateName?: string | null;
}

interface TemplateSelectorProps {
  disabled?: boolean;
  form: UseFormReturn<ItemFormData>;
  rulesetId: string;
  templateName?: string | null;
  type: TemplateItemType;
}

/**
 * A template as the server holds it now (`templateId`, of `rulesetId`'s items): a cached one may be older, and a save
 * keeps of its fields those that differ from the template's at that time.
 */
function fetchTemplate(queryClient: QueryClient, rulesetId: string, templateId: string) {
  return queryClient.fetchQuery({ ...customizationEntityQuery(rulesetId, "items", templateId), staleTime: NO_TIME });
}

function TemplateSelector({ form, rulesetId, templateName, type, disabled }: TemplateSelectorProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const { data: templates, isLoading, error } = useQuery(itemTemplatesQuery(rulesetId, type));
  const { fields } = useEntityFields(rulesetId, "items");
  const held = form.watch("sourceItemId");

  // An item starts with its template's fields, which a save keeps none of while they're the template's: another
  // template's fill in once they load, unless another was picked since, and none leaves them empty
  const handleTemplateChange = (templateId: unknown) => {
    if (!fields) return;
    form.setValue("fields", emptyFieldValues(fields), { shouldDirty: true });
    if (typeof templateId !== "string" || !templateId) return;
    const stillPicked = () => form.getValues("sourceItemId") === templateId;
    fetchTemplate(queryClient, rulesetId, templateId).then(
      ({ entity }) => {
        if (stillPicked()) form.setValue("fields", toFieldValues(fields, entity), { shouldDirty: true });
      },
      (error) => {
        if (stillPicked()) snackbar.error(error, "Failed to load the template's fields");
      },
    );
  };

  return (
    <SelectField
      control={form.control}
      name="sourceItemId"
      label={`${type} Template`}
      options={templateOptions(templates, held, templateName)}
      emptyLabel="None"
      onChange={handleTemplateChange}
      disabled={isLoading || disabled}
      loadError={error}
    />
  );
}

export function ItemFormFields({ form, rulesetId, lockType, newItem, templateName }: ItemFormFieldsProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const { fields } = useEntityFields(rulesetId, "items");
  const itemType = form.watch("type");
  const isTemplate = form.watch("isTemplate");

  // A new type takes none of the old type's templates, and a template type sets its slot. A new item's template's
  // values go with it once they load (what's typed over them stays), unless another template was picked since
  const handleTypeChange = (newType: unknown) => {
    const templateId = form.getValues("sourceItemId");
    for (const field of fieldsClearedByType(newType)) form.setValue(field, "", { shouldDirty: true });
    if (!newItem || !templateId || !fields) return;
    const noneSince = () => !form.getValues("sourceItemId");
    fetchTemplate(queryClient, rulesetId, templateId).then(
      ({ entity }) => {
        if (!noneSince()) return;
        form.setValue("fields", ownFieldValues(fields, form.getValues("fields"), entity), { shouldDirty: true });
      },
      (error) => {
        if (noneSince()) snackbar.error(error, "Failed to load the template's fields");
      },
    );
  };

  return (
    <>
      <NameField control={form.control} name="name" />
      <DescriptionField control={form.control} name="description" />
      <FormTextField
        control={form.control}
        name="costGp"
        rules={DECIMAL_RULES}
        label="Cost (gp)"
        type="text"
        fullWidth
        slotProps={{
          htmlInput: { inputMode: "decimal" },
        }}
      />
      <FormTextField
        control={form.control}
        name="weight"
        rules={DECIMAL_RULES}
        label="Weight (lbs)"
        type="text"
        fullWidth
        slotProps={{
          htmlInput: { inputMode: "decimal" },
        }}
      />
      {/* A template is of a type an item can be based on a template of */}
      <SelectField
        control={form.control}
        name="type"
        label="Item Type"
        options={isTemplate ? TEMPLATE_ITEM_TYPES : ITEM_TYPE_OPTIONS}
        emptyLabel={isTemplate ? undefined : "None"}
        onChange={handleTypeChange}
        disabled={lockType}
      />
      {isOneOf(itemType, TEMPLATE_ITEM_TYPES) ? (
        !isTemplate && (
          <TemplateSelector
            form={form}
            rulesetId={rulesetId}
            templateName={templateName}
            type={itemType}
            disabled={lockType}
          />
        )
      ) : (
        <SelectField
          control={form.control}
          name="slot"
          label="Slot"
          options={LOCATION_OPTIONS}
          emptyLabel="None"
          disabled={lockType}
        />
      )}
      <EntityFields form={form} entityType="items" rulesetId={rulesetId} columns={2} />
    </>
  );
}
