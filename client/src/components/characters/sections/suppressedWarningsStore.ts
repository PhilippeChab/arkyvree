import { create } from "zustand";

interface SuppressedWarningsState {
  shouldWarn: (key: WarningKey) => boolean;
  /** The warnings the user asked not to see again until the page reloads. */
  suppressed: Partial<Record<WarningKey, true>>;
  suppressWarningForSession: (key: WarningKey) => void;
}

/** A confirmation the user can stop for the session: lowering an ability score. */
type WarningKey = "abilityDecrease";

/**
 * The confirmations the user turned off for the session (a lowered ability score's): kept in memory alone, none in the
 * browser, so a reload asks again.
 */
export const useSuppressedWarningsStore = create<SuppressedWarningsState>()((set, get) => ({
  suppressed: {},
  shouldWarn: (key) => !get().suppressed[key],
  suppressWarningForSession: (key) => set((state) => ({ suppressed: { ...state.suppressed, [key]: true } })),
}));
