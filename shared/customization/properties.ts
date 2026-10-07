export interface PropertyType {
  description?: string;
  entityType?: string;
  isStatic: boolean;
  usageCount?: number;
  value: string;
}

export interface PropertyTypeCompletion {
  detail?: string;
  entityType?: string;
  kind: "engine" | "custom";
  label: string;
  value: string;
}

export interface PropertyValueCompletion {
  kind: "engine" | "custom";
  label: string;
  value: string;
}

/** Values in the order of `options`, those it doesn't name after them as given. */
function sortByOptions(values: string[], options: readonly string[] | null): string[] {
  if (!options) return values;
  const rank = (value: string) => {
    const at = options.indexOf(value);
    return at === -1 ? options.length : at;
  };
  return values.toSorted((a, b) => rank(a) - rank(b));
}

/** An UPPER_SNAKE_CASE property type as a label ("SPELL_SCHOOL" → "Spell School"). */
export function formatPropertyType(type: string) {
  return type
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

/** Each type's values joined in its options' order (`groupPropertyValues`): an entity's properties as a sheet lists them. */
export function formatPropertyValues(
  valuesByType: Record<string, string[]>,
  optionsOf: (type: string) => readonly string[] | null,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(valuesByType).map(([type, values]) => [type, sortByOptions(values, optionsOf(type)).join(", ")]),
  );
}

/**
 * An entity's property values by type, each type's in the order of its options (`optionsOf`, a ruleset's static
 * values for the type: a spell's components as V, S, M…, its descriptors alphabetical, as the books print them),
 * those no option names after them as given. Never the order their rows are stored in, which no write controls: a
 * copy, an edit or a reseed could reorder them.
 */
export function groupPropertyValues(
  properties: { type: string; value: string }[],
  optionsOf: (type: string) => readonly string[] | null,
): Record<string, string[]> {
  const valuesByType: Record<string, string[]> = {};
  for (const { type, value } of properties) (valuesByType[type] ??= []).push(value);
  return Object.fromEntries(
    Object.entries(valuesByType).map(([type, values]) => [type, sortByOptions(values, optionsOf(type))]),
  );
}
