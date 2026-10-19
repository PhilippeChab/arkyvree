import { useState } from "react";

/**
 * A class tab's changes before its save (`edits`, from `empty`), the class's (`classId`): once the page follows a copy
 * of it, whose levels are others, it holds none.
 */
export function useClassDraft<T>(classId: string, empty: T) {
  const [draft, setDraft] = useState({ classId, edits: empty });
  const edits = draft.classId === classId ? draft.edits : empty;
  const setEdits = (change: (current: T) => T) =>
    setDraft((current) => ({ classId, edits: change(current.classId === classId ? current.edits : empty) }));
  return { edits, setEdits };
}
