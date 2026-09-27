import type { QueryKey } from "@tanstack/react-query";

export interface EditorProps<T> {
  rulesetId: string;
  entityId: string;
  entity: T;
  canEdit: boolean;
  /**
   * After a save: follows the saved id (editing an inherited entity copies it
   * into this ruleset), refreshes `listKey` and returns the entity refetch.
   */
  onSaved: (savedId: string, listKey: QueryKey, message: string) => Promise<unknown>;
}

/** The form key: inherited entities keep their id in every fork. */
export const editorKey = (rulesetId: string, entityId: string) => `${rulesetId}/${entityId}`;
