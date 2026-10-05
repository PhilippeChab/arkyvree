export interface PropertyType {
  value: string;
  isStatic: boolean;
  entityType?: string;
  description?: string;
  usageCount?: number;
}

export interface PropertyTypeCompletion {
  label: string;
  value: string;
  detail?: string;
  kind: "engine" | "custom";
  entityType?: string;
}

export interface PropertyValueCompletion {
  label: string;
  value: string;
  kind: "engine" | "custom";
}

/**
 * A property type's values in the order of its options (a ruleset's static values for the type: a spell's components
 * as V, S, M…, its descriptors alphabetical, as the books print them), those no option names after them as given.
 * Never the order their rows are stored in, which no write controls: a copy, an edit or a reseed could reorder them.
 */
export function sortByOptions(values: string[], options: readonly string[] | null): string[] {
  if (!options) return values;
  const rank = (value: string) => {
    const at = options.indexOf(value);
    return at === -1 ? options.length : at;
  };
  return values.toSorted((a, b) => rank(a) - rank(b));
}

/** An UPPER_SNAKE_CASE property type as a label ("SPELL_SCHOOL" → "Spell School"). */
export const formatPropertyType = (type: string) =>
  type
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
