import { create } from "zustand";
import { persist } from "zustand/middleware";

import { isRecord } from "@/shared/isRecord.ts";

import { isThemeMode, legacyThemeMode, type ThemeMode } from "./themeMode.ts";
import {
  updateWarning,
  WARNING_DEFAULTS,
  WARNING_KEYS,
  type WarningKey,
  type WarningPreference,
} from "./warningPreferences.ts";

interface UserPreferencesState {
  /** Light, dark, or the system's */
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  warnings: Record<WarningKey, WarningPreference>;
  shouldWarn: (key: WarningKey) => boolean;
  setWarningEnabled: (key: WarningKey, enabled: boolean) => void;
  suppressWarningForSession: (key: WarningKey) => void;
}

export const useUserPreferencesStore = create<UserPreferencesState>()(
  persist(
    (set, get) => ({
      themeMode: "system",
      setThemeMode: (themeMode) => set({ themeMode }),
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
        themeMode: state.themeMode,
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
        const themeMode =
          isRecord(persisted) && isThemeMode(persisted.themeMode) ? persisted.themeMode : legacyThemeMode();
        return { ...current, themeMode, warnings };
      },
    },
  ),
);
