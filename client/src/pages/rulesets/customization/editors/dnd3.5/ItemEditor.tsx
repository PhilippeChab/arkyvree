import { parseResponse } from "hono/client";

import { ValueChip } from "@/client/src/components/common/index.ts";
import { useFormSync, useFormWith } from "@/client/src/hooks/index.ts";
import { formatCost, formatWeight } from "@/client/src/lib/formatNumeric.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import {
  EMPTY_ITEM,
  type ItemFormData,
  ItemFormFields,
  toItemForm,
  toItemPayload,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import type { EditorProps } from "@/client/src/pages/rulesets/customization/editors/renderEditor.tsx";
import type { Item } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { useEntitySave } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

export function ItemEditor({
  rulesetId,
  entityId,
  recordKey,
  adoptKey,
  entity: item,
  canEdit,
  locked,
  followCopy,
  refetchSaved,
}: EditorProps<Item>) {
  const form = useFormWith<ItemFormData>(EMPTY_ITEM);
  const sync = useFormSync(form, toItemForm(item), { key: recordKey, adoptKey, updatedAt: item.updatedAt });
  const saveMutation = useEntitySave({
    rulesetId,
    entityId,
    sync,
    followCopy,
    storeSaved: refetchSaved,
    listKey: QUERY_KEYS.rulesets.section(rulesetId, "items"),
    label: "Item",
    saveFn: (data: ItemFormData, updatedAt: string | undefined) =>
      parseResponse(
        rpc.api.rulesets[":id"].items[":itemId"].$put({
          param: { id: rulesetId, itemId: entityId },
          json: { ...toItemPayload(data), updatedAt },
        }),
      ),
  });

  const cost = formatCost(item.costGp);
  const weight = formatWeight(item.weight);

  return (
    <EntityDetailsCard
      title="Item Details"
      description={item.description}
      chips={
        <>
          {item.type && <ValueChip label={item.type} />}
          {item.slot && <ValueChip label={item.slot} color="info" />}
          {cost && <ValueChip label={cost} color="default" />}
          {weight && <ValueChip label={weight} color="default" />}
        </>
      }
      edit={
        canEdit
          ? {
              fields: <ItemFormFields form={form} rulesetId={rulesetId} templateName={item.templateName} />,
              onSubmit: sync.handleSubmit((data) => saveMutation.mutate(data)),
              canSave: sync.isDirty && !locked,
              isSaving: saveMutation.isPending,
            }
          : undefined
      }
    />
  );
}
