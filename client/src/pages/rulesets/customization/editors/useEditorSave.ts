import { type QueryKey, useMutation } from "@tanstack/react-query";
import type { FieldValues } from "react-hook-form";

import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import type { FormSync } from "@/client/src/hooks/index.ts";
import type { EditorProps } from "./types.ts";

interface EditorSaveOptions<TForm, TSaved> {
  sync: FormSync<TForm & FieldValues>;
  /** Sends the form; resolves to the saved row. */
  save: (data: TForm) => Promise<TSaved>;
  entityId: string;
  onSaved: EditorProps<unknown>["onSaved"];
  listKey: QueryKey;
  /** "Feat", "Class level"… for the toasts. */
  label: string;
}

/** The save of a customization editor: rebaselines the form and hands the saved row to the page. */
export function useEditorSave<TForm extends FieldValues, TSaved extends { id: string; updatedAt?: string }>({
  sync,
  save,
  entityId,
  onSaved,
  listKey,
  label,
}: EditorSaveOptions<TForm, TSaved>) {
  const snackbar = useSnackbar();
  return useMutation({
    // What the save was for, fixed when it is sent: the editor may show another record by the time it lands.
    mutationFn: async (data: TForm) => ({ sourceId: entityId, listKey, label, saved: await save(data) }),
    onSuccess: ({ saved, sourceId, listKey: savedListKey, label: savedLabel }, submitted) => {
      sync.saved(submitted, saved.updatedAt);
      return onSaved(sourceId, saved, savedListKey, `${savedLabel} updated`);
    },
    onError: (err) => snackbar.error(err, `Failed to update ${label.toLowerCase()}`),
  });
}
