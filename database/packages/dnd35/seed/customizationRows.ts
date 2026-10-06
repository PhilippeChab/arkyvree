/** The customization rows a seed writes for its content: modifiers, requirements and properties, by their owner. */

import type { Modifier, ModifierSeed, Property, RequirementEntry } from "@/database/packages/dnd35/content/types.ts";
import type {
  modifiersInCustomization,
  propertiesInCustomization,
  requirementsInCustomization,
} from "@/drizzle/schema.ts";

type PropertyRow = typeof propertiesInCustomization.$inferInsert;
type RequirementRow = typeof requirementsInCustomization.$inferInsert;

export type ModifierRow = typeof modifiersInCustomization.$inferInsert;

/** A spell list's spells joining the list of the class whose level gave the source: a cleric's domain, the cleric's. */
export function joinsClassList(sourceId: string, sourceType: string, list: string): ModifierRow {
  return {
    sourceId,
    sourceType,
    target: `aptitudes.${list}.joinsclasslist`,
    value: "true",
    valueType: "boolean",
    operator: "set",
  };
}

export function modifierRows(
  sourceId: string,
  sourceType: string,
  modifiers: (Modifier | ModifierSeed)[] = [],
): ModifierRow[] {
  return modifiers.map(({ target, operator, value, valueType }) => ({
    sourceId,
    sourceType,
    target,
    operator,
    value,
    valueType,
  }));
}

export function propertyRows(entityId: string, entityType: string, properties: Property[] = []): PropertyRow[] {
  return properties.map(({ type, value }) => ({ entityId, entityType, type, value }));
}

/** An entity's requirements as rows: each numbered by its place in the tree ("1", "2", "2.1"…). */
export function requirementRows(
  entityId: string,
  entityType: string,
  entries: RequirementEntry[] = [],
): RequirementRow[] {
  const rows: RequirementRow[] = [];
  const walk = (list: RequirementEntry[], parent?: string) => {
    for (const [i, entry] of list.entries()) {
      const level = parent ? `${parent}.${i + 1}` : String(i + 1);
      if ("chainingOperator" in entry) {
        rows.push({ entityId, entityType, level, chainingOperator: entry.chainingOperator });
        walk(entry.children, level);
      } else {
        rows.push({ entityId, entityType, level, ...entry });
      }
    }
  };
  walk(entries);
  return rows;
}

/**
 * The slots a spell list gives: one more spell a day at each spell level from the first to the ninth, and any
 * spell of the list to prepare there (`allowed` set to -1).
 */
export function spellListSlots(sourceId: string, sourceType: string, list: string): ModifierRow[] {
  return Array.from({ length: 9 }, (_, i) => [
    {
      sourceId,
      sourceType,
      target: `aptitudes.${list}.${i + 1}.uses`,
      value: "1",
      valueType: "number",
      operator: "add",
    },
    {
      sourceId,
      sourceType,
      target: `aptitudes.${list}.${i + 1}.allowed`,
      value: "-1",
      valueType: "number",
      operator: "set",
    },
  ]).flat();
}

/** The rows without the repeats: the first of each key. */
export function uniqueBy<T>(rows: T[], key: (row: T) => string): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => !seen.has(key(row)) && seen.add(key(row)));
}
