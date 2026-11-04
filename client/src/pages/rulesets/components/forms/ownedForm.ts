/**
 * An owned kind's entity (3.5's class level), by its rules' fields: what its read gives of it (`readOwned`: its row,
 * its number, its fields' values its tracks read, its links of its `grants` and its `amounts` lists, each at its list's
 * role), and its form (`toOwnedForm`), its create's and its edit's body, which writes them among its links, by those
 * roles, its number its `position`.
 */

import type { RulesDescription } from "@/client/src/lib/queries.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { isRecord } from "@/shared/isRecord.ts";

import { type EntityFieldValues, placeOf, toWholeValues } from "./entityFields.ts";

/**
 * An owned entity's amount of an entity (3.5's base of a save), as its read gives it among its links and its form holds
 * it and its save sends it: the entity (`toId`), and its value.
 */
export interface AmountRow {
  amount: number;
  toId: string;
}

/**
 * An owned entity's grant (3.5's feat) as its read gives it among its links: the entity (`toId`), its name (`toName`)
 * and its description (`toDescription`), the one it's through (`viaId`) and its name (`viaName`), and whether it's
 * free.
 */
export interface GrantLink {
  free: boolean;
  /** Whether a character takes the granted entity more than once: one that doesn't is granted at one level */
  stacks: boolean;
  toDescription: string | null;
  toId: string;
  toName: string;
  viaId: string;
  viaName: string | null;
}

/**
 * An owned entity's grant as its form holds it and its save sends it: the entity (`toId`), and the one it's through.
 */
export interface GrantRow {
  toId: string;
  viaId: string;
}

/** An owned entity's form: its number (`position`), its declared fields, and its amounts and grants among its links. */
export interface OwnedFormData {
  [key: string]: unknown;
  fields?: EntityFieldValues;
  links?: OwnedLinks;
  position: number;
}

/**
 * An owned entity's links as its form holds them and its save sends them: its amounts and its grants, by their roles.
 */
export interface OwnedLinks {
  [role: string]: AmountRow[] | GrantRow[] | undefined;
}

/** An owned kind's lists of links read past its other fields: its amounts' and its grants'. */
export interface OwnedLists {
  amounts?: Extract<EntityField, { input: "amounts" }>;
  grants?: Extract<EntityField, { input: "grants" }>;
}

/**
 * An owned entity as its route reads it: its row, its number (`position`), its amounts and its grants, its links of its
 * lists, and its fields' values its Progression tab's tracks read (`values`, by their tracks' keys).
 */
export interface OwnedRead {
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

/** An owned entity's empty form (`lists`, its rules'): the first, which has no amount and grants nothing. */
export function emptyOwned({ amounts, grants }: OwnedLists): OwnedFormData {
  return {
    position: 1,
    links: { ...(amounts && { [amounts.role]: [] }), ...(grants && { [grants.role]: [] }) },
  };
}

/**
 * The places (`placeOf`) of an owned kind's fields (`fields`) an owner of `ownerKind` leaves out: those of the tracks
 * its rules' progression leaves out for the kind (`tracks`' `omittedFor`: 3.5's bonded creature's class's base attack
 * bonus, saves and skill points, which its sheet works out), a track of amounts its lists' amounts. None while the
 * owner's kind is unknown.
 */
export function omittedPlacesOf(
  fields: readonly EntityField[] | undefined,
  tracks: RulesDescription["progression"]["tracks"],
  ownerKind: string | undefined,
): string[] {
  const { amounts } = ownedListsOf(fields);
  return tracks.flatMap(({ field, omittedFor, source }) => {
    if (ownerKind === undefined || !omittedFor?.includes(ownerKind)) return [];
    if (source === "amounts") return amounts ? [placeOf(amounts)] : [];
    return field === undefined ? [] : [`fields.${field}`];
  });
}

/** An owned kind's lists of links (`fields`, its rules': 3.5's class level's), read past its other fields. */
export function ownedListsOf(fields: readonly EntityField[] | undefined): OwnedLists {
  return {
    amounts: fields?.find((field) => field.input === "amounts"),
    grants: fields?.find((field) => field.input === "grants"),
  };
}

/**
 * An owned entity as its route reads it (`row`: its number its `position` on its class's track), its amounts and its
 * grants among its links, at its lists' roles (`lists`): an amount its entity (`toId`) and its `amount`; a grant its
 * entity and its name and description (`toName`, `toDescription`), the one it's through and its name (`viaId`,
 * `viaName`), and whether it's free; and the values of its fields its tracks read (`tracks`: each a stored field, by
 * its track's key).
 */
export function readOwned(
  row: { id: string; position: number; updatedAt: string } & Record<string, unknown>,
  { amounts, grants }: OwnedLists,
  tracks: readonly { field: string; key: string }[] = [],
): OwnedRead {
  return {
    amounts: linksAt(row, amounts).map((link): AmountRow => ({
      amount: typeof link.amount === "number" ? link.amount : 0,
      toId: textAt(link, "toId") ?? "",
    })),
    grants: linksAt(row, grants).map((link): GrantLink => ({
      free: link.free === true,
      // Rules that don't say let it stack, as a grant always did
      stacks: link.stacks !== false,
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
 * An owned entity's form off its read (`ownedEntity`): its number (its `position`), and its lists of links as its
 * rules describe them (`fields`), its amounts and its grants, read off its links (`toWholeValues`).
 */
export function toOwnedForm(fields: readonly EntityField[], ownedEntity: { position: number }): OwnedFormData {
  return { position: ownedEntity.position, ...toWholeValues(fields, ownedEntity) } as OwnedFormData;
}

/**
 * An owned entity's amounts as its endpoints take them (`rows`, its form's): every one of the ruleset's entities
 * (`entities`: 3.5's saves), 0 where unset. Until those have loaded, the owned entity's own go out unchanged: the
 * endpoints replace the list, so an empty one would clear them.
 */
export function withAllAmounts(entities: readonly { id: string }[] | undefined, rows: unknown): unknown {
  if (!entities) return rows;
  const own = Array.isArray(rows) ? rows.filter(isRecord) : [];
  return entities.map((entity) => {
    const amount = own.find((row) => row.toId === entity.id)?.amount;
    return { toId: entity.id, amount: typeof amount === "number" ? amount : 0 };
  });
}
