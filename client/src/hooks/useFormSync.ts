import { useEffect, useRef } from "react";
import type { FieldValues, SubmitHandler, UseFormReturn } from "react-hook-form";

import { useDirtyForm } from "./useDirtyForm.ts";

interface FormSyncOptions {
  /**
   * The record this one was copied from, when a copy-on-write moved the page
   * to the copy: a form still holding it carries its edits over to `key`.
   */
  adoptKey?: string;
  /**
   * The record the form edits, from the URL: opening another record resets
   * the form, edits included. Not the fetched id, which a copy-on-write can
   * change under the same page.
   */
  key?: string;
  /** The record's `updatedAt`, used as the stale-edit token. */
  updatedAt?: string;
}

interface ServerVersion {
  key: string | undefined;
  snapshot: string;
  updatedAt: string | undefined;
}

export type FormSync<T extends FieldValues> = ReturnType<typeof useFormSync<T>>;

/**
 * Keep an edit form showing the latest server values without wiping unsaved
 * edits. While the form is clean it follows the server; a change that arrives
 * while it is dirty waits until the edits are saved or undone. Pass
 * `undefined` while loading, and the form's empty values when it edits nothing
 * the server holds (a new password).
 *
 * - `isDirty` says the form holds unsaved edits, which its Save waits for;
 *   while it does, a reload of the page asks first (`useDirtyForm`).
 * - `handleSubmit(onValid)` replaces `form.handleSubmit`: it remembers which
 *   record the save is for.
 * - `updatedAt()` is the token of the server values the form is based on.
 *   Send it with the save, not the query's current `updatedAt`: when the
 *   record changed under the user's edits, the save is then rejected as
 *   stale instead of silently overwriting the newer values.
 * - `saved(values, updatedAt?)` replaces `form.reset()` after a successful
 *   save: the form shows what was saved under the token the server returned,
 *   and the pre-save data still in the cache is ignored until the refetch
 *   lands. It does nothing if another record was opened meanwhile.
 */
export function useFormSync<T extends FieldValues>(
  form: UseFormReturn<T>,
  values: NoInfer<T> | undefined,
  { key, adoptKey, updatedAt }: FormSyncOptions = {},
) {
  const { isDirty } = form.formState;
  useDirtyForm(isDirty);
  // Compare by content: a refetch returns new objects even when nothing changed.
  const snapshot = values === undefined ? undefined : JSON.stringify(values);
  const synced = useRef<ServerVersion>(undefined);
  // The pre-save server version, still cached until the refetch lands.
  const superseded = useRef<Omit<ServerVersion, "key">>(undefined);
  // The record the save in flight was sent for.
  const savingKey = useRef<string>(undefined);

  useEffect(() => {
    if (snapshot === undefined) return;
    const current = synced.current;
    if (current && adoptKey !== undefined && current.key !== key && current.key === adoptKey) {
      // Moved to the copy of the record the form holds: keep its edits.
      current.key = key;
      if (savingKey.current === adoptKey) savingKey.current = key;
    }
    if (!current || current.key !== key) {
      // First load, or another record: start from its values.
      form.reset(JSON.parse(snapshot) as T);
      synced.current = { key, snapshot, updatedAt };
      superseded.current = undefined;
      return;
    }
    const stale = superseded.current;
    // Skip only that exact version: by token when there is one, as values
    // equal to the pre-save ones can still be a newer version.
    if (stale && (updatedAt !== undefined ? updatedAt === stale.updatedAt : snapshot === stale.snapshot)) return;
    superseded.current = undefined;
    if (current.snapshot === snapshot) {
      // The record changed outside this form's fields (or not at all): the
      // form is still based on current values, under the newer token.
      current.updatedAt = updatedAt;
    } else if (!isDirty) {
      form.reset(JSON.parse(snapshot) as T);
      synced.current = { key, snapshot, updatedAt };
    }
    // Otherwise the change waits behind the user's edits.
  }, [key, adoptKey, snapshot, updatedAt, isDirty, form]);

  const saved = (savedValues: T, savedUpdatedAt?: string) => {
    // The user moved to another record while the save was in flight.
    if (synced.current?.key !== savingKey.current) return;
    superseded.current = snapshot === undefined ? undefined : { snapshot, updatedAt };
    form.reset(savedValues);
    synced.current = { key: savingKey.current, snapshot: JSON.stringify(savedValues), updatedAt: savedUpdatedAt };
  };

  const handleSubmit = (onValid: SubmitHandler<T>) =>
    form.handleSubmit((data, event) => {
      savingKey.current = synced.current?.key;
      return onValid(data, event);
    });

  return {
    handleSubmit,
    isDirty,
    updatedAt: () => synced.current?.updatedAt,
    saved,
  };
}
