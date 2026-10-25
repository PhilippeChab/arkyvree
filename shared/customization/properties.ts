import { sortByOrder } from "@/shared/sortByOrder.ts";

/** An UPPER_SNAKE_CASE property type as a label ("SPELL_SCHOOL" → "Spell School"). */
export function formatPropertyType(type: string) {
  return type
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Each type's values joined in its options' order (`optionsOf`, a ruleset's closed values for the type: a spell's
 * components as V, S, M…, its descriptors alphabetical, as the books print them), those no option names after them as
 * given: an entity's values as a sheet lists them, those a modifier adds included.
 */
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
