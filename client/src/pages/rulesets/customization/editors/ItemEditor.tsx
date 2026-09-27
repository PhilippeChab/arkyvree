import { Chip } from "@mui/material";
import { useForm } from "react-hook-form";

import { useFormSync } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import { ItemFormFields, type ItemFormInternal, toItemForm, toItemPayload } from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import type { Item } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import type { EditorProps } from "./types.ts";
import { useEditorSave } from "./useEditorSave.ts";

export function ItemEditor({ rulesetId, entityId, recordKey, adoptKey, entity: item, canEdit, locked, onSaved }: EditorProps<Item>) {
  const form = useForm<ItemFormInternal>();
  const sync = useFormSync(form, toItemForm(item), { key: recordKey, adoptKey, updatedAt: item.updatedAt });
  const saveMutation = useEditorSave({
    sync,
    entityId,
    onSaved,
    listKey: queryKeys.rulesets.section(rulesetId, "items"),
    label: "Item",
    save: (data: ItemFormInternal) => parseResponse(rpc.api.rulesets[":id"].items[":itemId"].$put({
      param: { id: rulesetId, itemId: entityId },
      json: { ...toItemPayload(data), updatedAt: sync.updatedAt() },
    })),
  });

  return (
    <EntityDetailsCard
      title="Item Details"
      sx={{ mb: 4 }}
      description={item.description}
      chips={(
        <>
          {item.type && <Chip label={item.type} size="small" color="secondary" sx={{ fontWeight: 600 }} />}
          {item.slot && <Chip label={item.slot} size="small" color="info" variant="outlined" />}
          {item.costGp && <Chip label={`${item.costGp} gp`} size="small" variant="outlined" />}
          {item.weight && <Chip label={`${item.weight} lb`} size="small" variant="outlined" />}
        </>
      )}
      edit={canEdit ? {
        fields: <ItemFormFields form={form} rulesetId={rulesetId} />,
        onSubmit: sync.handleSubmit((data) => saveMutation.mutate(data)),
        canSave: form.formState.isDirty && !locked,
        isSaving: saveMutation.isPending,
      } : undefined}
    />
  );
}
