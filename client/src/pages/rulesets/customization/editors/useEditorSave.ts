import { type QueryKey, useMutation } from "@tanstack/react-query";
import type { FieldValues } from "react-hook-form";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import type { FormSync } from "@/client/src/hooks/index.ts";

interface EditorSaveOptions<TForm, TSaved> {
  entityId: string;
  /** "Feat", "Class level"… for the toasts. */
  label: string;
  listKey: QueryKey;
  onSaved: EditorProps<unknown>["onSaved"];
  /** Sends the form; resolves to the saved row. */
  saveFn: (data: TForm) => Promise<TSaved>;
  sync: FormSync<TForm & FieldValues>;
}

/** What the customization page passes each editor of an entity's details. */
export interface EditorProps<T> {
  /** Set right after a copy-on-write moved the page here: the record the form may still hold. */
  adoptKey?: string;
  canEdit: boolean;
  entity: T;
  entityId: string;
  /** No saving: the page still shows the entity a copy was made from. */
  locked: boolean;
  /**
   * After a save of `sourceId`: follows the saved id when it differs (editing
   * an inherited entity copies it into this ruleset), refreshes `listKey` and
   * returns the entity refetch.
   */
  onSaved: (sourceId: string, saved: { id: string }, listKey: QueryKey, message: string) => Promise<unknown>;
  /** The form's record identity (useFormSync's `key`). */
  recordKey: string;
  rulesetId: string;
}

/** The save of a customization editor: rebaselines the form and hands the saved row to the page. */
export function useEditorSave<TForm extends FieldValues, TSaved extends { id: string; updatedAt?: string }>({
  sync,
  saveFn,
  entityId,
  onSaved,
  listKey,
  label,
}: EditorSaveOptions<TForm, TSaved>) {
  const snackbar = useSnackbar();
  return useMutation({
    // What the save was for, fixed when it is sent: the editor may show another record by the time it lands.
    mutationFn: async (data: TForm) => ({ sourceId: entityId, listKey, label, saved: await saveFn(data) }),
    onSuccess: ({ saved, sourceId, listKey: savedListKey, label: savedLabel }, submitted) => {
      sync.saved(submitted, saved.updatedAt);
      return onSaved(sourceId, saved, savedListKey, `${savedLabel} updated`);
    },
    onError: (error) => snackbar.error(error, `Failed to update ${label.toLowerCase()}`),
  });
}
