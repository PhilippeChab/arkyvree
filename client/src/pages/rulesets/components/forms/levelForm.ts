/**
 * An owned kind's level (3.5's class level), by its rules' columns: what its read gives of it (`readLevel`: its row,
 * its fields' values its tracks read, the entities it grants through its `grants` column, its amounts through its
 * `amounts` column, each list at its column's role), and its form, its create's and its edit's body, which writes them
 * among its links, by those roles, its number its `position`.
 */

import type { RulesDescription } from "@/client/src/lib/queries.ts";
import { isRecord } from "@/shared/isRecord.ts";

import type { EntityFieldValues } from "./entityFields.ts";

/** A column of a kind's form, as its rules describe it. */
type LevelColumn = NonNullable<RulesDescription["columns"][string]>[number];

/** A level's amount of an entity (3.5's base of a save): the entity, and its value. */
export interface Amount {
  amount: number;
  entityId: string;
}

/** A level's amount as its form holds it and its save sends it: the entity (`toId`), and its value. */
export interface AmountRow {
  amount: number;
  toId: string;
}

/** A level's grant (3.5's feat): the entity, its name and description, the one it's through, whether it's free. */
export interface Grant {
  description: string | null;
  entityId: string;
  free: boolean;
  name: string;
  viaId: string;
  viaName: string | null;
}

/** A level's grant as its form holds it and its save sends it: the entity (`toId`), and the one it's through. */
export interface GrantRow {
  toId: string;
  viaId: string;
}

/** A level kind's columns read past its fields: its amounts' and its grants'. */
export interface LevelColumns {
  amounts?: Extract<LevelColumn, { input: "amounts" }>;
  grants?: Extract<LevelColumn, { input: "grants" }>;
}

/** A level's form: its number (`position`), its declared fields, and its amounts and grants among its links. */
export interface LevelFormData {
  [key: string]: unknown;
  fields?: EntityFieldValues;
  links?: LevelLinks;
  position: number;
}

/** A level's links as its form holds them and its save sends them: its amounts and its grants, by their roles. */
export interface LevelLinks {
  [role: string]: AmountRow[] | GrantRow[] | undefined;
}

/**
 * A level as its route reads it: its row, its number, its amounts and its grants, by its columns, and its fields'
 * values its Progression tab's tracks read (`values`, by their tracks' keys).
 */
export interface LevelRead {
  amounts: Amount[];
  grants: Grant[];
  id: string;
  level: number;
  row: Record<string, unknown>;
  updatedAt: string;
  values: Record<string, unknown>;
}

/** The records of a list a row holds at a key, none where it holds none. */
function recordsAt(row: Record<string, unknown>, key: string | undefined): Record<string, unknown>[] {
  const value = key === undefined ? undefined : row[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

/** A record's text at a key, none where it holds none. */
function textAt(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

/** A level's empty form (`columns`, its rules'): the first, which has no amount and grants nothing. */
export function emptyLevel({ amounts, grants }: LevelColumns): LevelFormData {
  return {
    position: 1,
    links: { ...(amounts && { [amounts.role]: [] }), ...(grants && { [grants.role]: [] }) },
  };
}

/** A level kind's columns (`type`: 3.5's `class-levels`) read past its fields. */
export function levelColumnsOf(rules: RulesDescription | undefined, type: string): LevelColumns {
  const columns = rules?.columns[type] ?? [];
  return {
    amounts: columns.find((column) => column.input === "amounts"),
    grants: columns.find((column) => column.input === "grants"),
  };
}

/**
 * A class's next level, which its create dialog opens on (`levels`, its levels as read): one above its highest, from
 * whose amounts it starts; a class without levels starts from the first's empty form. Its declared fields start from
 * the highest's too (the class levels' section's `withEntityFields`).
 */
export function nextLevel(levels: readonly LevelRead[] | undefined, columns: LevelColumns): LevelFormData {
  if (!levels?.length) return emptyLevel(columns);
  const highest = levels.reduce((top, level) => (level.level > top.level ? level : top));
  const { amounts, grants } = columns;
  return {
    position: highest.level + 1,
    links: {
      ...(amounts && { [amounts.role]: highest.amounts.map(toAmountRow) }),
      ...(grants && { [grants.role]: [] }),
    },
  };
}

/**
 * A level as its route reads it (`row`: its number its `position` on its class's track), its amounts and its grants at
 * its columns' roles (`columns`): a grant its entity's row, the one it's through and its name beside it (`viaId`,
 * `viaName`), and whether it's free; an amount its entity (`toId`) and its `amount`; and the values of its fields its
 * tracks read (`tracks`: each a stored field, by its track's key).
 */
export function readLevel(
  row: { id: string; position: number; updatedAt: string } & Record<string, unknown>,
  { amounts, grants }: LevelColumns,
  tracks: readonly { field: string; key: string }[] = [],
): LevelRead {
  return {
    amounts: recordsAt(row, amounts?.role).map((record): Amount => ({
      amount: typeof record.amount === "number" ? record.amount : 0,
      entityId: textAt(record, "toId") ?? "",
    })),
    grants: recordsAt(row, grants?.role).map((record): Grant => ({
      description: textAt(record, "description"),
      entityId: textAt(record, "id") ?? "",
      free: record.free === true,
      name: textAt(record, "name") ?? "",
      viaId: textAt(record, "viaId") ?? "",
      viaName: textAt(record, "viaName"),
    })),
    id: row.id,
    level: row.position,
    row,
    updatedAt: row.updatedAt,
    values: Object.fromEntries(
      tracks.map(({ field, key }) => [key, isRecord(row.fields) ? row.fields[field] : undefined]),
    ),
  };
}

/** An amount as a level's form and body hold it: its entity (`toId`) and its value. */
export function toAmountRow(amount: Amount): AmountRow {
  return { toId: amount.entityId, amount: amount.amount };
}

/**
 * A level's amounts as its endpoints take them (`rows`, its form's): every one of the ruleset's entities (`entities`:
 * 3.5's saves), 0 where unset. Until those have loaded, the level's own go out unchanged: the endpoints replace the
 * list, so an empty one would clear them.
 */
export function withAllAmounts(entities: readonly { id: string }[] | undefined, rows: unknown): unknown {
  if (!entities) return rows;
  const own = Array.isArray(rows) ? rows.filter(isRecord) : [];
  return entities.map((entity) => {
    const amount = own.find((row) => row.toId === entity.id)?.amount;
    return toAmountRow({ amount: typeof amount === "number" ? amount : 0, entityId: entity.id });
  });
}
