export interface WarningPreference {
  enabled: boolean;
  suppressedThisSession: boolean;
}

export type WarningKey = (typeof WARNING_KEYS)[number];

/** The warnings a state holds, by key. */
export type WarningsState = { warnings: Record<WarningKey, WarningPreference> };

export const WARNING_KEYS = ["abilityDecrease"] as const;

export const WARNING_DEFAULTS: Record<WarningKey, WarningPreference> = {
  abilityDecrease: { enabled: true, suppressedThisSession: false },
};

/** A store update that changes one warning's preference. */
export function updateWarning(key: WarningKey, patch: Partial<WarningPreference>) {
  return (state: WarningsState): WarningsState => ({
    warnings: { ...state.warnings, [key]: { ...state.warnings[key], ...patch } },
  });
}
