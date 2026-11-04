import { type QueryKey, useMutation, useQueryClient } from "@tanstack/react-query";
import type { FieldValues } from "react-hook-form";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import type { FormSync } from "@/client/src/hooks/index.ts";
import { changedValues } from "@/client/src/pages/rulesets/components/forms/index.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { invalidateRulesetEdit } from "@/client/src/pages/rulesets/details/sectionQueries.ts";

export interface EntitySaveOptions<TForm extends FieldValues, TSaved, TCached> {
  /** Where the page caches what it shows of the entity, and how that takes the saved row: the save stores it there */
  cached: SavedEntityCache<TCached, TSaved>;
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
  sync: FormSync<TForm>;
  /** The form's values the saved row holds, its new baseline; else the values it sent */
  toFormValues?: (saved: TSaved) => TForm;
}

/**
 * Where a ruleset entity's page caches what it shows of the entity its form saves (`keyOf`, by the entity's id), and how
 * what's cached there takes a save's row (`withSaved`): the row's values laid over it, and the rest of what the page
 * reads (an entity's customizations, a level's class's name) kept.
 */
export interface SavedEntityCache<TCached, TSaved> {
  keyOf: (entityId: string) => QueryKey;
  withSaved: (cached: TCached, saved: TSaved) => TCached;
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
  sendsAllFields?: EntitySaveOptions<TForm, unknown, unknown>["sendsAllFields"],
): TForm {
  if (!("fields" in data || "links" in data) || sendsAllFields?.(data, baseline)) return data;
  return changedValues(data, baseline, fields);
}

/**
 * The save of a ruleset entity's inline form, its page's details: sends it under its token, the fields beside its name
 * and its lists whole, and its other fields those it changed alone (a value its ruleset no longer lists stays until
 * it's changed), rebaselines the form, follows a copy of an inherited entity, puts the saved row in the page's cache
 * (`cached`), refreshes its list and says so: every entity page alike.
 */
export function useEntitySave<TForm extends FieldValues, TSaved extends { id: string; updatedAt?: string }, TCached>({
  rulesetId,
  entityId,
  fields = [],
  label,
  listKey,
  sync,
  saveFn,
  sendsAllFields,
  toFormValues,
  cached,
  followCopy,
}: EntitySaveOptions<TForm, TSaved, TCached>) {
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
      followCopy(saved.id, sourceId);
      // Into the page's cache, once the page follows a copy (whose queries it seeded with the source's): laid over what's
      // there at once, so the page shows it, the rest refetched. What's cached under the entity (a pool filter's pick
      // of it, an owner's tabs), and under its source after a copy, is read again when next shown.
      queryClient.setQueryData<TCached>(cached.keyOf(saved.id), (held) =>
        held === undefined ? undefined : cached.withSaved(held, saved),
      );
      for (const id of new Set([saved.id, sourceId]))
        void queryClient.invalidateQueries({ queryKey: cached.keyOf(id), refetchType: "none" });
      void queryClient.invalidateQueries({ queryKey: cached.keyOf(saved.id), exact: true });
      void invalidateRulesetEdit(queryClient, rulesetId, [savedListKey]);
      snackbar.success(`${savedLabel} updated`);
    },
    onError: (error) => snackbar.error(error, `Failed to update ${label.toLowerCase()}`),
  });
}
