import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import type { FieldPath, FieldValues, UseFormReturn } from "react-hook-form";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { NO_TIME } from "@/client/src/lib/durations.ts";
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { useEntityFields } from "@/client/src/pages/rulesets/hooks/index.ts";

import type { ColumnContext } from "./columnContext.ts";
import { ownFieldValues, placeOf, setFormParts } from "./entityFields.ts";

/** An entity's template (an item's), a column a form's templates are of a type of. */
type TemplateField = Extract<EntityField, { input: "template" }>;

/**
 * A template as the server holds it now (`templateId`, of `rulesetId`'s entities of `entityType`), whose values a new
 * entity drops.
 */
function fetchTemplate(queryClient: QueryClient, rulesetId: string, entityType: string, templateId: string) {
  return queryClient.fetchQuery({
    ...customizationEntityQuery(rulesetId, { type: entityType }, templateId),
    staleTime: NO_TIME,
  });
}

/** A path of a form's values, which a column's description names as text (`links.madeFrom`). */
function formPath<T extends FieldValues>(path: string): FieldPath<T> {
  return path as FieldPath<T>;
}

/**
 * What a form's choice's change does besides, for its columns' templates (`TemplateInput`): the column a template is
 * of a type of (its stored field, `typeField`) takes none of its old type's templates, emptying it, and a new entity
 * drops the old template's values it holds of its declared fields once they load (what's typed over them stays),
 * unless another template was picked since. None where its columns have no template (`onChoiceChange`).
 */
export function useTemplateReset<T extends FieldValues>(
  form: UseFormReturn<T>,
  rulesetId: string,
  entityType: string,
  columns: readonly EntityField[],
  context: ColumnContext,
) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const { fields } = useEntityFields(rulesetId, entityType);
  const template = columns.find((column): column is TemplateField => column.input === "template");
  if (!template) return { onChoiceChange: undefined };
  const onChoiceChange = (field: string) => {
    if (field !== template.typeField) return;
    const templatePath = formPath<T>(placeOf(template));
    const templateId: unknown = form.getValues(templatePath);
    form.setValue(templatePath, "" as never, { shouldDirty: true });
    if (!context.newEntity || typeof templateId !== "string" || !templateId || !fields) return;
    const noneSince = () => !form.getValues(templatePath);
    fetchTemplate(queryClient, rulesetId, entityType, templateId).then(
      ({ entity }) => {
        if (!noneSince()) return;
        setFormParts(form, ownFieldValues(fields, form.getValues(), entity));
      },
      (fetchError) => {
        if (noneSince()) snackbar.error(fetchError, "Failed to load the template's fields");
      },
    );
  };
  return { onChoiceChange };
}
