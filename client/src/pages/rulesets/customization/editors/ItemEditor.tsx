import { Chip } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { useFormSync } from "@/client/src/hooks/index.ts";
import { formatDecimal } from "@/client/src/lib/formatNumeric.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import { ItemFormFields, type ItemFormInternal, toItemPayload } from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import type { Item } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { editorKey, type EditorProps } from "./types.ts";

const toItemForm = (item: Item): ItemFormInternal => ({
  name: item.name,
  description: item.description ?? "",
  costGp: formatDecimal(item.costGp) ?? "",
  weight: formatDecimal(item.weight) ?? "",
  type: item.type,
  slot: item.slot ?? undefined,
  isTemplate: item.isTemplate,
  sourceItemId: item.isTemplate ? undefined : item.sourceItemId ?? undefined,
});

export function ItemEditor({ rulesetId, entityId, entity: item, canEdit, onSaved }: EditorProps<Item>) {
  const snackbar = useSnackbar();
  const form = useForm<ItemFormInternal>();
  const sync = useFormSync(form, toItemForm(item), { key: editorKey(rulesetId, entityId), updatedAt: item.updatedAt });

  const saveMutation = useMutation({
    mutationFn: (data: ItemFormInternal) => parseResponse(rpc.api.rulesets[":id"].items[":itemId"].$put({
      param: { id: rulesetId, itemId: entityId },
      json: { ...toItemPayload(data), updatedAt: sync.updatedAt() },
    })),
    onSuccess: (saved, submitted) => {
      sync.saved(submitted, saved.updatedAt);
      return onSaved(saved.id, queryKeys.rulesets.section(rulesetId, "items"), "Item updated");
    },
    onError: (err) => snackbar.error(err, "Failed to update item"),
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
        canSave: form.formState.isDirty,
        isSaving: saveMutation.isPending,
      } : undefined}
    />
  );
}
