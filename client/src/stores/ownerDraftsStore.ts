import { create } from "zustand";

interface OwnerDraftsState {
  /** Leaves the owner's drafts behind: the page was left without saving them */
  discard: () => void;
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
 * A progression owner's tab's draft: its edits, the tokens of the levels it began over, and whether it changes
 * anything.
 */
export interface OwnerTabDraft {
  changed: boolean;
  edits: unknown;
  tokens?: { ownedTokens: { id: string; updatedAt: string }[] };
}

/**
 * The unsaved edits of a progression owner's page's tabs (those of its base rules' that edit before a save), kept while
 * the page shows another of its tabs, so switching tabs loses none; the page reads whether any changes something, which
 * its leaving asks about.
 */
export const useOwnerDraftsStore = create<OwnerDraftsState>((set) => ({
  drafts: {},
  discard: () => set({ ownerId: undefined, drafts: {} }),
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
