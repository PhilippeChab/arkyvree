import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WarningKey = "abilityDecrease";

interface WarningPreference {
  enabled: boolean;
  suppressedThisSession: boolean;
}

const WARNING_DEFAULTS: Record<WarningKey, WarningPreference> = {
  abilityDecrease: { enabled: true, suppressedThisSession: false },
};

interface UserPreferencesState {
  warnings: Record<WarningKey, WarningPreference>;
  shouldWarn: (key: WarningKey) => boolean;
  setWarningEnabled: (key: WarningKey, enabled: boolean) => void;
  suppressWarningForSession: (key: WarningKey) => void;
}

const updateWarning = (key: WarningKey, patch: Partial<WarningPreference>) =>
(state: UserPreferencesState): Pick<UserPreferencesState, "warnings"> => ({
  warnings: { ...state.warnings, [key]: { ...state.warnings[key], ...patch } },
});

export const useUserPreferencesStore = create<UserPreferencesState>()(
  persist(
    (set, get) => ({
      warnings: WARNING_DEFAULTS,
      shouldWarn: (key) => {
        const warning = get().warnings[key];
        return warning.enabled && !warning.suppressedThisSession;
      },
      setWarningEnabled: (key, enabled) => set(updateWarning(key, { enabled })),
      suppressWarningForSession: (key) => set(updateWarning(key, { suppressedThisSession: true })),
    }),
    {
      name: "user-preferences",
      version: 1,
      partialize: (state) => ({
        warnings: Object.fromEntries(
          Object.entries(state.warnings).map(([key, value]) => [key, { enabled: value.enabled }]),
        ),
      }),
      merge: (persisted, current) => {
        const saved = (persisted as { warnings?: Partial<Record<WarningKey, { enabled?: boolean }>> } | undefined)
          ?.warnings ?? {};
        const warnings = {} as Record<WarningKey, WarningPreference>;
        for (const key of Object.keys(current.warnings) as WarningKey[]) {
          warnings[key] = { ...current.warnings[key], enabled: saved[key]?.enabled ?? current.warnings[key].enabled };
        }
        return { ...current, warnings };
      },
    },
  ),
);
