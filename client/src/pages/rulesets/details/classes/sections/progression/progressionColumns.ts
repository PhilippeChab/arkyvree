/**
 * A class's levels as its Progression tab reads them, by its rules' level columns: the entities a level grants (its
 * `grants` field: 3.5's feats, each through a feat pool) and its amounts (its `amounts` field: 3.5's base per save), at
 * the keys those columns say.
 */

import type { RulesDescription } from "@/client/src/lib/queries.ts";
import { isRecord } from "@/shared/isRecord.ts";

import type { Amount, Grant, ProgressionKeys, ProgressionLevel } from "./progressionDraft.ts";

/** A column of a kind's form, as its rules describe it. */
type LevelColumn = NonNullable<RulesDescription["columns"][string]>[number];

/** A level's columns the tab reads past its fields: its amounts' and its grants'. */
export interface LevelColumns {
  amounts?: Extract<LevelColumn, { input: "amounts" }>;
  grants?: Extract<LevelColumn, { input: "grants" }>;
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

/** A level kind's columns (`type`, its rules' class levels': 3.5's `klass_levels`) the tab reads past its fields. */
export function levelColumnsOf(rules: RulesDescription | undefined, type: string): LevelColumns {
  const columns = rules?.columns[type] ?? [];
  return {
    amounts: columns.find((column) => column.input === "amounts"),
    grants: columns.find((column) => column.input === "grants"),
  };
}

/** Where a progression's save writes a level's amounts and grants (`columns`, its level's). */
export function progressionKeysOf({ amounts, grants }: LevelColumns): ProgressionKeys {
  return {
    ...(amounts && { amounts: { amountKey: amounts.amountKey, entityKey: amounts.entityKey, key: amounts.key } }),
    ...(grants && { grants: { entityKey: grants.entityKey, key: grants.key, viaKey: grants.viaKey } }),
  };
}

/**
 * A level as its route reads it (`row`), its amounts and its grants at its columns' keys (`columns`): a grant its
 * entity's row, the one it's through and its name beside it, and whether it's free.
 */
export function readProgressionLevel(
  row: { id: string; level: number; updatedAt: string } & Record<string, unknown>,
  { amounts, grants }: LevelColumns,
): ProgressionLevel {
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
    level: row.level,
    row,
    updatedAt: row.updatedAt,
  };
}
