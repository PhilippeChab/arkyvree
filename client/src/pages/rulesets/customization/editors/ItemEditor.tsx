import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import {
  type ItemBody,
  type ItemFormData,
  ItemFormFields,
  toEntityBody,
  toEntityForm,
  withEntityFields,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import type { Item } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { useEntityColumns, useEntityFields, useEntityForm } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import type { EditorProps } from "./renderEditor.tsx";

/** An item's form: its name, description and columns, and whether it's a template, which no form changes. */
function toItemForm(columns: Parameters<typeof toEntityForm>[0], item?: Item): ItemFormData {
  return { ...toEntityForm<ItemFormData>(columns, item), isTemplate: item?.isTemplate ?? false };
}

export function ItemEditor({
  rulesetId,
  entityId,
  recordKey,
  adoptKey,
  entity: item,
  locked,
  followCopy,
  refetchSaved,
}: EditorProps<Item>) {
  const { fields } = useEntityFields(rulesetId, "items");
  const { columns } = useEntityColumns(rulesetId, "items");
  const { form, save } = useEntityForm({
    empty: toItemForm(columns),
    values: withEntityFields(toItemForm(columns, item), fields, item),
    formKey: recordKey,
    adoptKey,
    updatedAt: item.updatedAt,
    locked,
    rulesetId,
    entityId,
    followCopy,
    storeSaved: refetchSaved,
    listKey: QUERY_KEYS.rulesets.section(rulesetId, "items"),
    label: "Item",
    // Moved to another template, it holds that one's fields: the save sends them all, the server keeping its own
    sendsAllFields: (data, baseline) => !!data.sourceItemId && data.sourceItemId !== baseline?.sourceItemId,
    saveFn: (data: ItemFormData, updatedAt: string | undefined) =>
      parseResponse(
        rpc.api.rulesets[":id"].items[":itemId"].$put({
          param: { id: rulesetId, itemId: entityId },
          json: { ...toEntityBody<ItemFormData, ItemBody>(columns, data), updatedAt },
        }),
      ),
  });

  return (
    <EntityDetailsCard
      title="Item Details"
      form={{
        fields: <ItemFormFields form={form} rulesetId={rulesetId} context={{ templateName: item.templateName }} />,
        ...save,
      }}
    />
  );
}
