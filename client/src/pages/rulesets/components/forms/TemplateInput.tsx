import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FieldPath, type FieldValues, useWatch } from "react-hook-form";

import { SelectField } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { NO_TIME } from "@/client/src/lib/durations.ts";
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { useEntityFields } from "@/client/src/pages/rulesets/hooks/index.ts";
import { templatesQuery } from "@/client/src/pages/rulesets/optionQueries.ts";

import type { ColumnInputProps } from "./columnContext.ts";
import { emptyFieldValues, setFormParts, toFieldValues } from "./entityFields.ts";
import { templateOptions } from "./templateOptions.ts";

/** The template an entity is made from (an item's). */
type TemplateField = Extract<EntityField, { input: "template" }>;

/**
 * A template as the server holds it now (`templateId`, of `rulesetId`'s entities of `entityType`): a cached one may be
 * older, and a save keeps of its fields those that differ from the template's at that time.
 */
function fetchTemplate(queryClient: QueryClient, rulesetId: string, entityType: string, templateId: string) {
  return queryClient.fetchQuery({
    ...customizationEntityQuery(rulesetId, { type: entityType }, templateId),
    staleTime: NO_TIME,
  });
}

/** A path of a form's values, which a column's description names as text (`fields.ITEM_TYPE`). */
function formPath<T extends FieldValues>(path: string): FieldPath<T> {
  return path as FieldPath<T>;
}

/**
 * The template an item is made from: a select of its type's templates (`typeField`, the stored field whose value
 * they're of), named for it ("Weapon Template"). An item starts with its template's fields, which a save keeps none of
 * while they're the template's: another template's fill in once they load, unless another was picked since, and none
 * leaves them empty. Its columns (its cost, its weight) stay as they are.
 */
export function TemplateInput<T extends FieldValues>({
  context,
  entityType,
  field,
  form,
  name,
  rulesetId,
}: ColumnInputProps<T, TemplateField>) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const type: unknown = useWatch({ control: form.control, name: formPath<T>(`fields.${field.typeField}`) });
  const held: unknown = useWatch({ control: form.control, name });
  const { data: templates, isLoading, error } = useQuery(templatesQuery(rulesetId, entityType, String(type)));
  const { fields } = useEntityFields(rulesetId, entityType);

  const handleTemplateChange = (templateId: unknown) => {
    if (!fields) return;
    setFormParts(form, emptyFieldValues(fields));
    if (typeof templateId !== "string" || !templateId) return;
    const stillPicked = () => form.getValues(name) === templateId;
    fetchTemplate(queryClient, rulesetId, entityType, templateId).then(
      ({ entity }) => {
        if (stillPicked()) setFormParts(form, toFieldValues(fields, entity));
      },
      (fetchError) => {
        if (stillPicked()) snackbar.error(fetchError, "Failed to load the template's fields");
      },
    );
  };

  return (
    <SelectField
      control={form.control}
      name={name}
      label={`${String(type)} ${field.label}`}
      options={templateOptions(templates, held, context.templateName)}
      emptyLabel="None"
      onChange={handleTemplateChange}
      disabled={isLoading || (context.locked?.includes(field.role) ?? false)}
      loadError={error}
    />
  );
}
