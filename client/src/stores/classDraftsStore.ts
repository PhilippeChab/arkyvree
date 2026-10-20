import { create } from "zustand";

interface ClassDraftsState {
  /** The class the drafts are of: one class's at a time */
  classId?: string;
  /** Leaves the class's drafts behind: the page was left without saving them */
  discard: () => void;
  /** Its tabs' drafts, by tab: they outlive a tab while the page shows another */
  drafts: Record<string, ClassTabDraft>;
  /** Whether a tab's draft changes anything, as the tab reads it */
  markChanged: (classId: string, tab: string, changed: boolean) => void;
  /** A tab's draft (`undefined`: none); another class's drafts are left behind */
  write: (classId: string, tab: string, draft: ClassTabDraft | undefined) => void;
}

/** A class tab's draft: its edits, the tokens of the levels it began over, and whether it changes anything. */
export interface ClassTabDraft {
  changed: boolean;
  edits: unknown;
  tokens?: { levelTokens: { levelId: string; updatedAt: string }[] };
}

/**
 * The unsaved edits of a class page's tabs (its progression, its spells), kept while the page shows another of its
 * tabs, so switching tabs loses none; the page reads whether any changes something, which its leaving asks about.
 */
export const useClassDraftsStore = create<ClassDraftsState>((set) => ({
  drafts: {},
  discard: () => set({ classId: undefined, drafts: {} }),
  markChanged: (classId, tab, changed) =>
    set((state) => {
      const draft = state.classId === classId ? state.drafts[tab] : undefined;
      if (!draft || draft.changed === changed) return state;
      return { drafts: { ...state.drafts, [tab]: { ...draft, changed } } };
    }),
  write: (classId, tab, draft) =>
    set((state) => {
      const drafts = state.classId === classId ? { ...state.drafts } : {};
      if (draft) drafts[tab] = draft;
      else delete drafts[tab];
      return { classId, drafts };
    }),
}));
