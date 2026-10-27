import { type QueryKey, useMutation, useQueryClient } from "@tanstack/react-query";
import type { FieldValues } from "react-hook-form";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import type { FormSync } from "@/client/src/hooks/index.ts";
import { changedValues } from "@/client/src/pages/rulesets/components/forms/entityFields.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { invalidateRulesetEdit } from "@/client/src/pages/rulesets/details/sectionQueries.ts";

export interface EntitySaveOptions<TForm extends FieldValues, TSaved> {
  /** The record the form edits, from the URL */
  entityId: string;
  /** Its fields, as its rules describe them, of which a save sends those it sends whole whatever it changed: none */
  fields?: readonly EntityField[];
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
   * Whether a save sends every field, not only those it changed from what the form is based on (`baseline`): an item
   * moved to another template, whose fields the server keeps only where they differ from that template's.
   */
  sendsAllFields?: (data: TForm, baseline: TForm | undefined) => boolean;
  /**
   * The saved row into the cache, before the page follows a copy: seeds its query with it, or refetches it where the
   * save's response lacks what the page reads (a customization page's entity's customizations). The save stays pending
   * until what it returns resolves.
   */
  storeSaved: (saved: TSaved, sourceId: string) => Promise<unknown> | void;
  sync: FormSync<TForm>;
  /** The form's values the saved row holds, its new baseline; else the values it sent */
  toFormValues?: (saved: TSaved) => TForm;
}

/**
 * A form's values as an edit sends them: of its fields and its links, those it sends whole (of `fields`,
 * `changedValues`) and those it changed from what it's based on (`baseline`), or every one when `sendsAllFields` says
 * so.
 */
function changesOf<TForm extends FieldValues>(
  data: TForm,
  baseline: TForm | undefined,
  fields: readonly EntityField[],
  sendsAllFields?: EntitySaveOptions<TForm, unknown>["sendsAllFields"],
): TForm {
  if (!("fields" in data || "links" in data) || sendsAllFields?.(data, baseline)) return data;
  return changedValues(data, baseline, fields);
}

/**
 * The save of a ruleset entity's inline form, its page's details: sends it under its token, the fields beside its name
 * and its lists whole, and its other fields those it changed alone (a value its ruleset no longer lists stays until it's changed), rebaselines the form, puts the saved row in the
 * cache, follows a copy of an inherited entity, refreshes its list and says so.
 */
export function useEntitySave<TForm extends FieldValues, TSaved extends { id: string; updatedAt?: string }>({
  rulesetId,
  entityId,
  fields = [],
  label,
  listKey,
  sync,
  saveFn,
  sendsAllFields,
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
      saved: await saveFn(changesOf(data, sync.baseline(), fields, sendsAllFields), sync.updatedAt()),
    }),
    onSuccess: ({ saved, sourceId, listKey: savedListKey, label: savedLabel }, submitted) => {
      sync.saved(toFormValues ? toFormValues(saved) : submitted, saved.updatedAt);
      const stored = storeSaved(saved, sourceId);
      followCopy(saved.id, sourceId);
      void invalidateRulesetEdit(queryClient, rulesetId, [savedListKey]);
      snackbar.success(`${savedLabel} updated`);
      return stored;
    },
    onError: (error) => snackbar.error(error, `Failed to update ${label.toLowerCase()}`),
  });
}
