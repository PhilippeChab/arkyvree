import { sortByOrder } from "@/shared/sortByOrder.ts";

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
    Object.entries(valuesByType).map(([type, values]) => [
      type,
      sortByOrder(values, optionsOf(type) ?? [], (value) => value).join(", "),
    ]),
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
    Object.entries(valuesByType).map(([type, values]) => [
      type,
      sortByOrder(values, optionsOf(type) ?? [], (value) => value),
    ]),
  );
}
