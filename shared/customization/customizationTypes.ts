/** A customization's kind: a modifier, or a requirement. */
export type CustomizationKind = keyof typeof CUSTOMIZATION_TYPES;

/** A customization's type, which its rows are stored and named by: "modifiers", "requirements". */
export type CustomizationType = (typeof CUSTOMIZATION_TYPES)[CustomizationKind];

/**
 * Each customization kind's type (a modifier's, "modifiers"): what its rows are stored as (a requirement's owner of
 * type "modifiers"), and what its rules' words name them by ("Modifier").
 */
export const CUSTOMIZATION_TYPES = { modifier: "modifiers", requirement: "requirements" } as const;
