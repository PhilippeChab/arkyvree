/**
 * Maps base rules to activity type word replacements.
 * Follows the factory pattern: each ruleset defines how generic
 * entity names should be displayed in activity labels.
 */
const activityLabelOverrides: Record<string, Record<string, string>> = {
  "Dungeons & Dragons: 3.5": {
    Power: "Spell",
  },
};

export function getActivityLabelOverrides(baseRules: string): Record<string, string> {
  return activityLabelOverrides[baseRules] ?? {};
}
