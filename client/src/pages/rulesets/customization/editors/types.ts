import type { QueryKey } from "@tanstack/react-query";

export interface EditorProps<T> {
  rulesetId: string;
  entityId: string;
  /** The form's record identity (useFormSync's `key`). */
  recordKey: string;
  /** Set right after a copy-on-write moved the page here: the record the form may still hold. */
  adoptKey?: string;
  entity: T;
  canEdit: boolean;
  /** No saving: the page still shows the entity a copy was made from. */
  locked: boolean;
  /**
   * After a save of `sourceId`: follows the saved id when it differs (editing
   * an inherited entity copies it into this ruleset), refreshes `listKey` and
   * returns the entity refetch.
   */
  onSaved: (sourceId: string, saved: { id: string }, listKey: QueryKey, message: string) => Promise<unknown>;
}
