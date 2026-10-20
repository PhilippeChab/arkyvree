import { useEffect } from "react";

import { type ClassTabDraft, useClassDraftsStore } from "@/client/src/stores/classDraftsStore.ts";

/** The tokens a draft's save is checked against: its levels', as the tab read them when it began. */
export type DraftTokens = NonNullable<ClassTabDraft["tokens"]>;

/**
 * A class tab's changes before its save (`edits`, from `empty`), the class's (`classId`) and the tab's (`tab`), kept
 * in the class's drafts while the page shows another of its tabs; once the page follows a copy of the class, whose
 * levels are others, it holds none. Whether they change anything (`changed`, as the tab reads them) guards the page's
 * leaving. Its first edit keeps its `levels`' tokens (`tokens`), so a save refuses a level changed since, however often
 * the tab reads them again; an edit while they're read again (`fresh` false: what shows may be older) keeps none yet,
 * the next one or the save reading them.
 */
export function useClassDraft<T>(
  classId: string,
  tab: string,
  levels: readonly { id: string; updatedAt: string }[],
  fresh: boolean,
  empty: T,
  changed: (edits: T) => boolean,
) {
  const stored = useClassDraftsStore((state) => (state.classId === classId ? state.drafts[tab] : undefined));
  const write = useClassDraftsStore((state) => state.write);
  const markChanged = useClassDraftsStore((state) => state.markChanged);
  // The store holds the edits this hook wrote there, of type `T`
  const edits = stored ? (stored.edits as T) : empty;
  const unsaved = !!stored && changed(edits);

  // Read fresh in an event: an edit, a settled save, over what the store holds then
  const current = () => {
    const state = useClassDraftsStore.getState();
    return state.classId === classId ? state.drafts[tab] : undefined;
  };
  const readTokens = (): DraftTokens => ({
    levelTokens: levels.map((level) => ({ levelId: level.id, updatedAt: level.updatedAt })),
  });

  // As the tab reads them: a save's refetch can make what's left change nothing
  useEffect(() => markChanged(classId, tab, unsaved), [classId, markChanged, tab, unsaved]);

  const setEdits = (change: (current: T) => T) => {
    const mine = current();
    const next = change(mine ? (mine.edits as T) : empty);
    write(classId, tab, {
      changed: changed(next),
      edits: next,
      tokens: mine?.tokens ?? (fresh ? readTokens() : undefined),
    });
  };

  return {
    discard: () => write(classId, tab, undefined),
    edits,
    /** After a refused save: the tokens it sent are forgotten, the next save reading the levels as they're read again. */
    forgetTokens: () => {
      const mine = current();
      if (mine) write(classId, tab, { ...mine, tokens: undefined });
    },
    setEdits,
    /**
     * After a save of the edits it sent (`sent`): none left, or those made while it ran, over the levels it moved, whose
     * tokens are read again.
     */
    settle: (sent: T) => {
      const mine = current();
      write(classId, tab, mine && mine.edits !== sent ? { ...mine, tokens: undefined } : undefined);
    },
    /** The tokens to send: those the draft began over, and the current ones of levels added since. */
    tokens: (): DraftTokens => {
      const kept = current()?.tokens;
      if (!kept) return readTokens();
      const known = new Set(kept.levelTokens.map(({ levelId }) => levelId));
      const added = readTokens().levelTokens.filter(({ levelId }) => !known.has(levelId));
      return { levelTokens: [...kept.levelTokens, ...added] };
    },
  };
}
