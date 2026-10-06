import type { PgTable } from "drizzle-orm/pg-core";

import type { Modifier, ModifierSeed, Property, RequirementEntry } from "@/database/packages/dnd35/content/types.ts";
import {
  modifiersInCustomization,
  type propertiesInCustomization,
  requirementsInCustomization,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";

type ModifierRow = typeof modifiersInCustomization.$inferInsert;
type PropertyRow = typeof propertiesInCustomization.$inferInsert;
type RequirementRow = typeof requirementsInCustomization.$inferInsert;

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

/** Inserts the rows, if there are any. */
export async function insertAll<T extends PgTable>(db: Db, table: T, rows: T["$inferInsert"][]) {
  if (rows.length > 0) await db.insert(table).values(rows);
}

/**
 * Inserts modifiers and gates the ones that give spell slots by the class level that opens their spell level:
 * `spellLevels` maps a spell level to it. The first class level needs no gate.
 */
export async function insertGatedSpellSlots(
  db: Db,
  rows: ModifierRow[],
  classTarget: string,
  spellLevels: Record<number, number>,
) {
  if (rows.length === 0) return;
  const inserted = await db
    .insert(modifiersInCustomization)
    .values(rows)
    .returning({ id: modifiersInCustomization.id, target: modifiersInCustomization.target });
  await insertAll(
    db,
    requirementsInCustomization,
    inserted.flatMap(({ id, target }) => {
      const spellLevel = target.match(/^aptitudes\.\w+\.(\d+)\.(uses|allowed)$/)?.[1];
      const classLevel = spellLevel === undefined ? undefined : spellLevels[Number(spellLevel)];
      if (classLevel === undefined || classLevel <= 1) return [];
      return [
        {
          entityId: id,
          entityType: "modifiers",
          level: "1",
          target: classTarget,
          operator: "greater_than_or_equal",
          value: String(classLevel),
          valueType: "number",
        },
      ];
    }),
  );
}

/**
 * Modifiers with their sources: the ones without requirements in one insert, and each one with requirements alone, its
 * requirements as rows of it.
 */
export async function insertModifiers(
  db: Db,
  sourceType: string,
  modifiers: { sourceId: string; modifier: ModifierSeed }[],
): Promise<void> {
  const plain = modifiers.filter(({ modifier }) => !modifier.requirements?.length);
  await insertAll(
    db,
    modifiersInCustomization,
    plain.flatMap(({ sourceId, modifier }) => modifierRows(sourceId, sourceType, [modifier])),
  );
  for (const { sourceId, modifier } of modifiers.filter(({ modifier }) => modifier.requirements?.length)) {
    const [row] = await db
      .insert(modifiersInCustomization)
      .values(modifierRows(sourceId, sourceType, [modifier]))
      .returning({ id: modifiersInCustomization.id });
    await insertAll(db, requirementsInCustomization, requirementRows(row.id, "modifiers", modifier.requirements));
  }
}
