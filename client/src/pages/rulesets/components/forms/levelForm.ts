/**
 * An owned kind's level (3.5's class level), by its rules' columns: what its read gives of it (`readLevel`: its row,
 * the entities it grants through its `grants` field, its amounts through its `amounts` field), and its form, its
 * create's and its edit's body, which writes them at those fields' keys.
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

/** A level's grant (3.5's feat): the entity, its name and description, the one it's through, whether it's free. */
export interface Grant {
  description: string | null;
  entityId: string;
  free: boolean;
  name: string;
  viaId: string;
  viaName: string | null;
}

/** A level kind's columns read past its fields: its amounts' and its grants'. */
export interface LevelColumns {
  amounts?: Extract<LevelColumn, { input: "amounts" }>;
  grants?: Extract<LevelColumn, { input: "grants" }>;
}

/**
 * Where a level's form and its class's progression's save write its amounts and grants, and a pool's picks: its rules'
 * level columns' keys (3.5's `saves` at `saveId` and `base`; `feats` at `featId` through `aptitudeId`, a pool's id's
 * key too).
 */
export interface LevelKeys {
  amounts?: { amountKey: string; entityKey: string; key: string };
  grants?: { entityKey: string; key: string; viaKey: string };
}

/** A level as its route reads it: its row (its fields), its number, its amounts and its grants, by its columns. */
export interface LevelRead {
  amounts: Amount[];
  grants: Grant[];
  id: string;
  level: number;
  row: Record<string, unknown>;
  updatedAt: string;
}

/** A level's form: its number, its declared fields, and its amounts and grants at their columns' keys. */
export type LevelFormData = Record<string, unknown> & { fields?: EntityFieldValues; level: number };

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

/** A level's empty form (`keys`, its columns'): the first, which has no amount and grants nothing. */
export function emptyLevel({ amounts, grants }: LevelKeys): LevelFormData {
  return { level: 1, ...(amounts && { [amounts.key]: [] }), ...(grants && { [grants.key]: [] }) };
}

/** A level kind's columns (`type`: 3.5's `class_levels`) read past its fields. */
export function levelColumnsOf(rules: RulesDescription | undefined, type: string): LevelColumns {
  const columns = rules?.columns[type] ?? [];
  return {
    amounts: columns.find((column) => column.input === "amounts"),
    grants: columns.find((column) => column.input === "grants"),
  };
}

/** Where a level's form and its progression's save write its amounts and grants (`columns`, its level kind's). */
export function levelKeysOf({ amounts, grants }: LevelColumns): LevelKeys {
  return {
    ...(amounts && { amounts: { amountKey: amounts.amountKey, entityKey: amounts.entityKey, key: amounts.key } }),
    ...(grants && { grants: { entityKey: grants.entityKey, key: grants.key, viaKey: grants.viaKey } }),
  };
}

/**
 * A class's next level, which its create dialog opens on (`levels`, its levels as read): one above its highest, from
 * whose amounts it starts; a class without levels starts from the first's empty form. Its declared fields start from
 * the highest's too (the class levels' section's `withEntityFields`).
 */
export function nextLevel(levels: readonly LevelRead[] | undefined, keys: LevelKeys): LevelFormData {
  if (!levels?.length) return emptyLevel(keys);
  const highest = levels.reduce((top, level) => (level.level > top.level ? level : top));
  const { amounts, grants } = keys;
  return {
    level: highest.level + 1,
    ...(amounts && { [amounts.key]: highest.amounts.map((amount) => toAmountRow(amount, amounts)) }),
    ...(grants && { [grants.key]: [] }),
  };
}

/**
 * A level as its route reads it (`row`: its number its `position` on its class's track), its amounts and its grants at
 * its columns' keys (`columns`): a grant its entity's row, the one it's through and its name beside it, and whether
 * it's free.
 */
export function readLevel(
  row: { id: string; position: number; updatedAt: string } & Record<string, unknown>,
  { amounts, grants }: LevelColumns,
): LevelRead {
  return {
    amounts: recordsAt(row, amounts?.key).map((record): Amount => ({
      amount: typeof record[amounts?.amountKey ?? ""] === "number" ? Number(record[amounts?.amountKey ?? ""]) : 0,
      entityId: textAt(record, amounts?.entityKey ?? "") ?? "",
    })),
    grants: recordsAt(row, grants?.key).map((record): Grant => ({
      description: textAt(record, "description"),
      entityId: textAt(record, "id") ?? "",
      free: record.free === true,
      name: textAt(record, "name") ?? "",
      viaId: textAt(record, grants?.viaKey ?? "") ?? "",
      viaName: textAt(record, grants?.viaName ?? ""),
    })),
    id: row.id,
    level: row.position,
    row,
    updatedAt: row.updatedAt,
  };
}

/** An amount as a level's form and body hold it: its entity and its value, at its column's keys (`amounts`). */
export function toAmountRow(amount: Amount, amounts: NonNullable<LevelKeys["amounts"]>) {
  return { [amounts.entityKey]: amount.entityId, [amounts.amountKey]: amount.amount };
}

/**
 * A level's amounts as its endpoints take them (`rows`, its form's, at `amounts`' keys): every one of the ruleset's
 * entities (`entities`: 3.5's saves), 0 where unset. Until those have loaded, the level's own go out unchanged: the
 * endpoints replace the list, so an empty one would clear them.
 */
export function withAllAmounts(
  entities: readonly { id: string }[] | undefined,
  rows: unknown,
  amounts: NonNullable<LevelKeys["amounts"]>,
): unknown {
  if (!entities) return rows;
  const own = Array.isArray(rows) ? rows.filter(isRecord) : [];
  return entities.map((entity) => {
    const amount = own.find((row) => row[amounts.entityKey] === entity.id)?.[amounts.amountKey];
    return toAmountRow({ amount: typeof amount === "number" ? amount : 0, entityId: entity.id }, amounts);
  });
}
