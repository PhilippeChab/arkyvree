import { create } from "zustand";

interface SuppressedWarningsState {
  shouldWarn: (key: WarningKey) => boolean;
  /** The warnings the user asked not to see again until the page reloads. */
  suppressed: Partial<Record<WarningKey, true>>;
  suppressWarningForSession: (key: WarningKey) => void;
}

/** A confirmation the user can stop for the session: a lowered base of a sheet's block, by the block's key. */
type WarningKey = string;

/**
 * The confirmations the user turned off for the session (a lowered score's base): kept in memory alone, none in the
 * browser, so a reload asks again.
 */
export const useSuppressedWarningsStore = create<SuppressedWarningsState>()((set, get) => ({
  suppressed: {},
  shouldWarn: (key) => !get().suppressed[key],
  suppressWarningForSession: (key) => set((state) => ({ suppressed: { ...state.suppressed, [key]: true } })),
}));
