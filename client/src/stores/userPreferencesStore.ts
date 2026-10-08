import { create } from "zustand";

interface UserPreferencesState {
  shouldWarn: (key: WarningKey) => boolean;
  /** The warnings the user asked not to see again until the page reloads. */
  suppressed: Partial<Record<WarningKey, true>>;
  suppressWarningForSession: (key: WarningKey) => void;
}

/** A confirmation the user can stop for the session: lowering an ability score. */
type WarningKey = "abilityDecrease";

/** The warnings the user turned off, for the session only: none is kept in the browser. */
export const useUserPreferencesStore = create<UserPreferencesState>()((set, get) => ({
  suppressed: {},
  shouldWarn: (key) => !get().suppressed[key],
  suppressWarningForSession: (key) => set((state) => ({ suppressed: { ...state.suppressed, [key]: true } })),
}));
