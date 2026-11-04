import { useEffect } from "react";
import { useStore } from "zustand";

import { useOwnerDrafts } from "@/client/src/pages/rulesets/details/owners/useOwnerDrafts.ts";
import type { OwnerTabDraft } from "@/client/src/stores/ownerDraftsStore.ts";

/** The tokens a draft's save is checked against: its owned entities', as the tab read them when it began. */
export type DraftTokens = NonNullable<OwnerTabDraft["tokens"]>;

/**
 * An owner's tab's changes before its save (`edits`, from `empty`), the owner's (`ownerId`) and the tab's (`tab`), kept
 * in the page's drafts while it shows another of its tabs, and gone as it closes; once the page follows a copy of the
 * owner, whose owned entities are others, it holds none. Whether they change anything (`changed`, as the tab reads
 * them) guards the page's reload. Its first edit keeps its `ownedEntities`' tokens (`tokens`), so a save refuses an owned entity
 * changed since, however often the tab reads them again; an edit while they're read again (`fresh` false: what shows
 * may be older) keeps none yet, the next one or the save reading them.
 */
export function useOwnerDraft<T>(
  ownerId: string,
  tab: string,
  ownedEntities: readonly { id: string; updatedAt: string }[],
  fresh: boolean,
  empty: T,
  changed: (edits: T) => boolean,
) {
  const drafts = useOwnerDrafts();
  const stored = useStore(drafts, (state) => (state.ownerId === ownerId ? state.drafts[tab] : undefined));
  const write = useStore(drafts, (state) => state.write);
  const markChanged = useStore(drafts, (state) => state.markChanged);
  // The store holds the edits this hook wrote there, of type `T`
  const edits = stored ? (stored.edits as T) : empty;
  const unsaved = !!stored && changed(edits);

  // Read fresh in an event: an edit, a settled save, over what the store holds then
  const current = () => {
    const state = drafts.getState();
    return state.ownerId === ownerId ? state.drafts[tab] : undefined;
  };
  const readTokens = (): DraftTokens => ({
    ownedTokens: ownedEntities.map((ownedEntity) => ({ id: ownedEntity.id, updatedAt: ownedEntity.updatedAt })),
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
    /**
     * After a refused save: the tokens it sent are forgotten, the next save reading the owned entities as they're read
     * again.
     */
    forgetTokens: () => {
      const mine = current();
      if (mine) write(ownerId, tab, { ...mine, tokens: undefined });
    },
    setEdits,
    /**
     * After a save of the edits it sent (`sent`): none left, or those made while it ran, over the owned entities it
     * moved, whose tokens are read again.
     */
    settle: (sent: T) => {
      const mine = current();
      write(ownerId, tab, mine && mine.edits !== sent ? { ...mine, tokens: undefined } : undefined);
    },
    /** The tokens to send: those the draft began over, and the current ones of owned entities added since. */
    tokens: (): DraftTokens => {
      const kept = current()?.tokens;
      if (!kept) return readTokens();
      const known = new Set(kept.ownedTokens.map(({ id }) => id));
      const added = readTokens().ownedTokens.filter(({ id }) => !known.has(id));
      return { ownedTokens: [...kept.ownedTokens, ...added] };
    },
  };
}
