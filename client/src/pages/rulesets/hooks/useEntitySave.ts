import { type QueryKey, useMutation, useQueryClient } from "@tanstack/react-query";
import type { FieldValues } from "react-hook-form";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import type { FormSync } from "@/client/src/hooks/index.ts";
import { invalidateRulesetEdit } from "@/client/src/pages/rulesets/details/sectionQueries.ts";

interface EntitySaveOptions<TForm extends FieldValues, TSaved> {
  /** The record the form edits, from the URL */
  entityId: string;
  /**
   * The page's `followCopy` (`useCopyOnWrite`): a save of an inherited entity copies it into the ruleset, and the page
   * moves to the copy.
   */
  followCopy: (copyId: string, sourceId: string) => void;
  /** "Feat", "Class level"… for the toasts. */
  label: string;
  /** The list it shows in, which its save refreshes with the ruleset's Local Changes */
  listKey: QueryKey;
  rulesetId: string;
  /** Sends the form under its stale-edit token (the form's `sync.updatedAt()`); resolves to the saved row. */
  saveFn: (data: TForm, updatedAt: string | undefined) => Promise<TSaved>;
  /**
   * The saved row into the cache, before the page follows a copy: seeds its query with it, or refetches it where the
   * save's response lacks what the page shows (a feat's aptitudes, a level's feats). The save stays pending until what
   * it returns resolves.
   */
  storeSaved: (saved: TSaved, sourceId: string) => Promise<unknown> | void;
  sync: FormSync<TForm>;
  /** The form's values the saved row holds, its new baseline; else the values it sent */
  toFormValues?: (saved: TSaved) => TForm;
}

/**
 * The save of a ruleset entity's inline form, its page's details: sends it under its token, rebaselines the form, puts
 * the saved row in the cache, follows a copy of an inherited entity, refreshes its list and says so.
 */
export function useEntitySave<TForm extends FieldValues, TSaved extends { id: string; updatedAt?: string }>({
  rulesetId,
  entityId,
  label,
  listKey,
  sync,
  saveFn,
  toFormValues,
  storeSaved,
  followCopy,
}: EntitySaveOptions<TForm, TSaved>) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  return useMutation({
    // What the save was for, fixed when it is sent: the page may show another record by the time it lands.
    mutationFn: async (data: TForm) => ({
      sourceId: entityId,
      listKey,
      label,
      saved: await saveFn(data, sync.updatedAt()),
    }),
    onSuccess: ({ saved, sourceId, listKey: savedListKey, label: savedLabel }, submitted) => {
      sync.saved(toFormValues ? toFormValues(saved) : submitted, saved.updatedAt);
      const stored = storeSaved(saved, sourceId);
      followCopy(saved.id, sourceId);
      invalidateRulesetEdit(queryClient, rulesetId, [savedListKey]);
      snackbar.success(`${savedLabel} updated`);
      return stored;
    },
    onError: (error) => snackbar.error(error, `Failed to update ${label.toLowerCase()}`),
  });
}
