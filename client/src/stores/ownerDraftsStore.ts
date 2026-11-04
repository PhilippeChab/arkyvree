import { createContext } from "react";
import { createStore, type StoreApi } from "zustand";

export interface OwnerDraftsState {
  /** Its tabs' drafts, by tab: they outlive a tab while the page shows another */
  drafts: Record<string, OwnerTabDraft>;
  /** Whether a tab's draft changes anything, as the tab reads it */
  markChanged: (ownerId: string, tab: string, changed: boolean) => void;
  /** The progression owner the drafts are of: one owner's at a time */
  ownerId?: string;
  /** A tab's draft (`undefined`: none); another owner's drafts are left behind */
  write: (ownerId: string, tab: string, draft: OwnerTabDraft | undefined) => void;
}

/**
 * A progression owner's tab's draft: its edits, the tokens of the owned entities it began over, and whether it changes
 * anything.
 */
export interface OwnerTabDraft {
  changed: boolean;
  edits: unknown;
  tokens?: { ownedTokens: { id: string; updatedAt: string }[] };
}

/** The drafts of the progression owner's page they're under, its own (`createOwnerDraftsStore`). */
export const OwnerDraftsContext = createContext<StoreApi<OwnerDraftsState> | null>(null);

/**
 * The unsaved edits of a progression owner's page's tabs (those of its base rules' that edit before a save), made as the
 * page opens and gone as it closes, as a form's edits are (`OwnerDraftsContext`); kept while the page shows another of
 * its tabs, so switching tabs loses none. The page reads whether any changes something, which a reload asks about.
 */
export function createOwnerDraftsStore() {
  return createStore<OwnerDraftsState>((set) => ({
    drafts: {},
    markChanged: (ownerId, tab, changed) =>
      set((state) => {
        const draft = state.ownerId === ownerId ? state.drafts[tab] : undefined;
        if (!draft || draft.changed === changed) return state;
        return { drafts: { ...state.drafts, [tab]: { ...draft, changed } } };
      }),
    write: (ownerId, tab, draft) =>
      set((state) => {
        const drafts = state.ownerId === ownerId ? { ...state.drafts } : {};
        if (draft) drafts[tab] = draft;
        else delete drafts[tab];
        return { ownerId, drafts };
      }),
  }));
}
