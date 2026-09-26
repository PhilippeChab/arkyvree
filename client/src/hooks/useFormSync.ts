import { useEffect, useRef } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";

interface ServerVersion {
  key: string | undefined;
  snapshot: string;
  updatedAt: string | undefined;
}

interface FormSyncOptions {
  /**
   * The record the page is on, from the URL: opening another record resets
   * the form, edits included. Not the fetched id, which a copy-on-write
   * can change under the same page.
   */
  key?: string;
  /** The record's `updatedAt`, used as the stale-edit token. */
  updatedAt?: string;
}

/**
 * Keep an edit form showing the latest server values without wiping unsaved
 * edits. While the form is clean it follows the server; a change that arrives
 * while it is dirty waits until the edits are saved or undone. Pass
 * `undefined` while loading.
 *
 * - `updatedAt()` is the token of the server values the form is based on.
 *   Send it with the save, not the query's current `updatedAt`: when the
 *   record changed under the user's edits, the save is then rejected as stale
 *   instead of silently overwriting the newer values.
 * - `saved(values, updatedAt?)` replaces `form.reset()` after a successful
 *   save: the form shows what was saved under the token the server returned,
 *   and the pre-save data still in the cache is ignored until the refetch
 *   lands.
 */
export function useFormSync<T extends FieldValues>(
  form: UseFormReturn<T>,
  values: NoInfer<T> | undefined,
  { key, updatedAt }: FormSyncOptions = {},
) {
  const { isDirty } = form.formState;
  // Compare by content: a refetch returns new objects even when nothing changed.
  const snapshot = values === undefined ? undefined : JSON.stringify(values);
  const synced = useRef<ServerVersion>(undefined);
  // Server values from before the last save, still cached until the refetch.
  const superseded = useRef<string>(undefined);

  useEffect(() => {
    if (snapshot === undefined) return;
    const current = synced.current;
    if (!current || current.key !== key) {
      // First load, or another record: start from its values.
      form.reset(JSON.parse(snapshot) as T);
      synced.current = { key, snapshot, updatedAt };
      superseded.current = undefined;
      return;
    }
    if (snapshot === superseded.current) return;
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
  }, [key, snapshot, updatedAt, isDirty, form]);

  const saved = (savedValues: T, savedUpdatedAt?: string) => {
    superseded.current = snapshot;
    form.reset(savedValues);
    synced.current = { key, snapshot: JSON.stringify(savedValues), updatedAt: savedUpdatedAt };
  };

  return {
    updatedAt: () => synced.current?.updatedAt,
    saved,
  };
}
