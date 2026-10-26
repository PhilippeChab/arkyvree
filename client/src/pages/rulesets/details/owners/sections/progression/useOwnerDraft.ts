import { useEffect } from "react";

import { type OwnerTabDraft, useOwnerDraftsStore } from "@/client/src/stores/ownerDraftsStore.ts";

/** The tokens a draft's save is checked against: its levels', as the tab read them when it began. */
export type DraftTokens = NonNullable<OwnerTabDraft["tokens"]>;

/**
 * An owner's tab's changes before its save (`edits`, from `empty`), the owner's (`ownerId`) and the tab's (`tab`), kept
 * in the owner's drafts while the page shows another of its tabs; once the page follows a copy of the owner, whose
 * levels are others, it holds none. Whether they change anything (`changed`, as the tab reads them) guards the page's
 * leaving. Its first edit keeps its `levels`' tokens (`tokens`), so a save refuses a level changed since, however often
 * the tab reads them again; an edit while they're read again (`fresh` false: what shows may be older) keeps none yet,
 * the next one or the save reading them.
 */
export function useOwnerDraft<T>(
  ownerId: string,
  tab: string,
  levels: readonly { id: string; updatedAt: string }[],
  fresh: boolean,
  empty: T,
  changed: (edits: T) => boolean,
) {
  const stored = useOwnerDraftsStore((state) => (state.ownerId === ownerId ? state.drafts[tab] : undefined));
  const write = useOwnerDraftsStore((state) => state.write);
  const markChanged = useOwnerDraftsStore((state) => state.markChanged);
  // The store holds the edits this hook wrote there, of type `T`
  const edits = stored ? (stored.edits as T) : empty;
  const unsaved = !!stored && changed(edits);

  // Read fresh in an event: an edit, a settled save, over what the store holds then
  const current = () => {
    const state = useOwnerDraftsStore.getState();
    return state.ownerId === ownerId ? state.drafts[tab] : undefined;
  };
  const readTokens = (): DraftTokens => ({
    ownedTokens: levels.map((level) => ({ id: level.id, updatedAt: level.updatedAt })),
  });

  // As the tab reads them: a save's refetch can make what's left change nothing
  useEffect(() => markChanged(ownerId, tab, unsaved), [ownerId, markChanged, tab, unsaved]);

  const setEdits = (change: (current: T) => T) => {
    const mine = current();
    const next = change(mine ? (mine.edits as T) : empty);
    write(ownerId, tab, {
      changed: changed(next),
      edits: next,
      tokens: mine?.tokens ?? (fresh ? readTokens() : undefined),
    });
  };

  return {
    discard: () => write(ownerId, tab, undefined),
    edits,
    /** After a refused save: the tokens it sent are forgotten, the next save reading the levels as they're read again. */
    forgetTokens: () => {
      const mine = current();
      if (mine) write(ownerId, tab, { ...mine, tokens: undefined });
    },
    setEdits,
    /**
     * After a save of the edits it sent (`sent`): none left, or those made while it ran, over the levels it moved, whose
     * tokens are read again.
     */
    settle: (sent: T) => {
      const mine = current();
      write(ownerId, tab, mine && mine.edits !== sent ? { ...mine, tokens: undefined } : undefined);
    },
    /** The tokens to send: those the draft began over, and the current ones of levels added since. */
    tokens: (): DraftTokens => {
      const kept = current()?.tokens;
      if (!kept) return readTokens();
      const known = new Set(kept.ownedTokens.map(({ id }) => id));
      const added = readTokens().ownedTokens.filter(({ id }) => !known.has(id));
      return { ownedTokens: [...kept.ownedTokens, ...added] };
    },
  };
}
