/**
 * An owned kind's level (3.5's class level), by its rules' fields: what its read gives of it (`readLevel`: its row, its
 * number, its fields' values its tracks read, its links of its `grants` and its `amounts` lists, each at its list's
 * role), and its form (`toLevelForm`), its create's and its edit's body, which writes them among its links, by those
 * roles, its number its `position`.
 */

import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { isRecord } from "@/shared/isRecord.ts";

import { type EntityFieldValues, toWholeValues } from "./entityFields.ts";

/**
 * A level's amount of an entity (3.5's base of a save), as its read gives it among its links and its form holds it
 * and its save sends it: the entity (`toId`), and its value.
 */
export interface AmountRow {
  amount: number;
  toId: string;
}

/**
 * A level's grant (3.5's feat) as its read gives it among its links: the entity (`toId`), its name (`toName`) and its
 * description (`toDescription`), the one it's through (`viaId`) and its name (`viaName`), and whether it's free.
 */
export interface GrantLink {
  free: boolean;
  toDescription: string | null;
  toId: string;
  toName: string;
  viaId: string;
  viaName: string | null;
}

/** A level's grant as its form holds it and its save sends it: the entity (`toId`), and the one it's through. */
export interface GrantRow {
  toId: string;
  viaId: string;
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

/** A level kind's lists of links read past its other fields: its amounts' and its grants'. */
export interface LevelLists {
  amounts?: Extract<EntityField, { input: "amounts" }>;
  grants?: Extract<EntityField, { input: "grants" }>;
}

/**
 * A level as its route reads it: its row, its number (`position`), its amounts and its grants, its links of its
 * lists, and its fields' values its Progression tab's tracks read (`values`, by their tracks' keys).
 */
export interface LevelRead {
  amounts: AmountRow[];
  grants: GrantLink[];
  id: string;
  position: number;
  row: Record<string, unknown>;
  updatedAt: string;
  values: Record<string, unknown>;
}

/** A row's links of a list (`list`: its role's, to its kind, `references`), none where it holds none. */
function linksAt(row: Record<string, unknown>, list: { references: string; role: string } | undefined) {
  if (!list || !Array.isArray(row.links)) return [];
  return row.links.filter(isRecord).filter((link) => link.role === list.role && link.toType === list.references);
}

/** A record's text at a key, none where it holds none. */
function textAt(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

/** A level's empty form (`lists`, its rules'): the first, which has no amount and grants nothing. */
export function emptyLevel({ amounts, grants }: LevelLists): LevelFormData {
  return {
    position: 1,
    links: { ...(amounts && { [amounts.role]: [] }), ...(grants && { [grants.role]: [] }) },
  };
}

/** A level kind's lists of links (`fields`, its rules': 3.5's class level's), read past its other fields. */
export function levelListsOf(fields: readonly EntityField[] | undefined): LevelLists {
  return {
    amounts: fields?.find((field) => field.input === "amounts"),
    grants: fields?.find((field) => field.input === "grants"),
  };
}

/**
 * A class's next level, which its create dialog opens on (`levels`, its levels as read): one above its highest, from
 * whose amounts it starts; a class without levels starts from the first's empty form. Its declared fields start from
 * the highest's too (the class levels' section's `withEntityFields`).
 */
export function nextLevel(levels: readonly LevelRead[] | undefined, lists: LevelLists): LevelFormData {
  if (!levels?.length) return emptyLevel(lists);
  const highest = levels.reduce((top, level) => (level.position > top.position ? level : top));
  const { amounts, grants } = lists;
  return {
    position: highest.position + 1,
    links: {
      ...(amounts && { [amounts.role]: highest.amounts.map((amount) => ({ ...amount })) }),
      ...(grants && { [grants.role]: [] }),
    },
  };
}

/**
 * A level as its route reads it (`row`: its number its `position` on its class's track), its amounts and its grants
 * among its links, at its lists' roles (`lists`): an amount its entity (`toId`) and its `amount`; a grant its entity
 * and its name and description (`toName`, `toDescription`), the one it's through and its name (`viaId`, `viaName`),
 * and whether it's free; and the values of its fields its tracks read (`tracks`: each a stored field, by its track's
 * key).
 */
export function readLevel(
  row: { id: string; position: number; updatedAt: string } & Record<string, unknown>,
  { amounts, grants }: LevelLists,
  tracks: readonly { field: string; key: string }[] = [],
): LevelRead {
  return {
    amounts: linksAt(row, amounts).map((link): AmountRow => ({
      amount: typeof link.amount === "number" ? link.amount : 0,
      toId: textAt(link, "toId") ?? "",
    })),
    grants: linksAt(row, grants).map((link): GrantLink => ({
      free: link.free === true,
      toDescription: textAt(link, "toDescription"),
      toId: textAt(link, "toId") ?? "",
      toName: textAt(link, "toName") ?? "",
      viaId: textAt(link, "viaId") ?? "",
      viaName: textAt(link, "viaName"),
    })),
    id: row.id,
    position: row.position,
    row,
    updatedAt: row.updatedAt,
    values: Object.fromEntries(
      tracks.map(({ field, key }) => [key, isRecord(row.fields) ? row.fields[field] : undefined]),
    ),
  };
}

/**
 * A level's form off its read (`level`): its number (its `position`), and its lists of links as its rules describe them
 * (`fields`), its amounts and its grants, read off its links (`toWholeValues`).
 */
export function toLevelForm(fields: readonly EntityField[], level: { position: number }): LevelFormData {
  return { position: level.position, ...toWholeValues(fields, level) } as LevelFormData;
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
    return { toId: entity.id, amount: typeof amount === "number" ? amount : 0 };
  });
}
