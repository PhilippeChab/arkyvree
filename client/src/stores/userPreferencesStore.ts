import { create } from "zustand";
import { persist } from "zustand/middleware";

import { isRecord } from "@/shared/isRecord.ts";

const WARNING_KEYS = ["abilityDecrease"] as const;
export type WarningKey = (typeof WARNING_KEYS)[number];

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

const updateWarning =
  (key: WarningKey, patch: Partial<WarningPreference>) =>
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
        // Only the known warnings' saved `enabled` flags are taken from storage.
        const saved = isRecord(persisted) && isRecord(persisted.warnings) ? persisted.warnings : {};
        const warnings = { ...current.warnings };
        for (const key of WARNING_KEYS) {
          const entry = saved[key];
          const enabled =
            isRecord(entry) && typeof entry.enabled === "boolean" ? entry.enabled : current.warnings[key].enabled;
          warnings[key] = { ...current.warnings[key], enabled };
        }
        return { ...current, warnings };
      },
    },
  ),
);
