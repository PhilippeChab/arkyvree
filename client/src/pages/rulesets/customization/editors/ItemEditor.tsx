import { Chip } from "@mui/material";

import { useFormSync, useFormWith } from "@/client/src/hooks/index.ts";
import { formatCost, formatWeight } from "@/client/src/lib/formatNumeric.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import {
  EMPTY_ITEM,
  ItemFormFields,
  type ItemFormInternal,
  toItemForm,
  toItemPayload,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import type { Item } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

import type { EditorProps } from "./types.ts";
import { useEditorSave } from "./useEditorSave.ts";

export function ItemEditor({
  rulesetId,
  entityId,
  recordKey,
  adoptKey,
  entity: item,
  canEdit,
  locked,
  onSaved,
}: EditorProps<Item>) {
  const form = useFormWith<ItemFormInternal>(EMPTY_ITEM);
  const sync = useFormSync(form, toItemForm(item), { key: recordKey, adoptKey, updatedAt: item.updatedAt });
  const saveMutation = useEditorSave({
    sync,
    entityId,
    onSaved,
    listKey: queryKeys.rulesets.section(rulesetId, "items"),
    label: "Item",
    save: (data: ItemFormInternal) =>
      parseResponse(
        rpc.api.rulesets[":id"].items[":itemId"].$put({
          param: { id: rulesetId, itemId: entityId },
          json: { ...toItemPayload(data), updatedAt: sync.updatedAt() },
        }),
      ),
  });

  const cost = formatCost(item.costGp);
  const weight = formatWeight(item.weight);

  return (
    <EntityDetailsCard
      title="Item Details"
      sx={{ mb: 4 }}
      description={item.description}
      chips={
        <>
          {item.type && <Chip label={item.type} size="small" color="secondary" sx={{ fontWeight: 600 }} />}
          {item.slot && <Chip label={item.slot} size="small" color="info" variant="outlined" />}
          {cost && <Chip label={cost} size="small" variant="outlined" />}
          {weight && <Chip label={weight} size="small" variant="outlined" />}
        </>
      }
      edit={
        canEdit
          ? {
              fields: <ItemFormFields form={form} rulesetId={rulesetId} />,
              onSubmit: sync.handleSubmit((data) => saveMutation.mutate(data)),
              canSave: form.formState.isDirty && !locked,
              isSaving: saveMutation.isPending,
            }
          : undefined
      }
    />
  );
}
