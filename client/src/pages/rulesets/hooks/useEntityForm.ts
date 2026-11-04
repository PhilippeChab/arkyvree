import type { DefaultValues, FieldValues } from "react-hook-form";

import { useFormSync, useFormWith } from "@/client/src/hooks/index.ts";

import { type EntitySaveOptions, useEntitySave } from "./useEntitySave.ts";

/** A ruleset entity page's inline form: its empty and its server values, the record it edits, and how it's saved. */
interface EntityFormOptions<TForm extends FieldValues, TSaved, TCached> extends Omit<
  EntitySaveOptions<TForm, TSaved, TCached>,
  "sync"
> {
  /** The record a copy-on-write moved the page from, whose form it takes over (`useCopyOnWrite`'s `adoptKey`) */
  adoptKey?: string;
  /** The form's values before the record's are in (`EMPTY_FEAT`) */
  empty: TForm & DefaultValues<TForm>;
  /** The record the form edits, from the URL (`useFormSync`'s `key`: the ruleset's id with an inherited entity's) */
  formKey: string | undefined;
  /** The record's `updatedAt`, its save's stale-edit token, when it has one */
  updatedAt?: string;
  /** The record's values, as the form holds them */
  values: TForm | undefined;
}

/**
 * A ruleset entity page's inline form, its details': made on its empty values, kept in step with the record's
 * (`useFormSync`), saved through `useEntitySave`; and its save as its card takes it (`EntityDetailsCard`'s `form`): its
 * submit, enabled once something changed, pending while it's sent.
 */
export function useEntityForm<TForm extends FieldValues, TSaved extends { id: string; updatedAt?: string }, TCached>({
  empty,
  values,
  formKey,
  adoptKey,
  updatedAt,
  ...saveOptions
}: EntityFormOptions<TForm, TSaved, TCached>) {
  const form = useFormWith<TForm>(empty);
  const sync = useFormSync(form, values, { key: formKey, adoptKey, updatedAt });
  const saveMutation = useEntitySave({ ...saveOptions, sync });
  return {
    form,
    save: {
      onSubmit: sync.handleSubmit((data) => saveMutation.mutate(data)),
      canSave: sync.isDirty,
      isSaving: saveMutation.isPending,
    },
  };
}
