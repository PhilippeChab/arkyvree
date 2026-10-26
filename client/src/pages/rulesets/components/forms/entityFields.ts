/**
 * An entity's columns and fields as its rules describe them (the API's `columns` and `fields`), as a form holds them,
 * where its save sends them (`placeOf`): a field's value by the stored field that keeps it, among its form's `fields`,
 * a link's by its role, among its form's `links`. Their values empty, an entity's, as a save sends them, the options a
 * choice offers, and when one shows.
 */

import type { InferRequestType } from "hono/client";
import type { FieldPath, FieldValues, UseFormReturn } from "react-hook-form";

import type { EntityRow } from "@/client/src/lib/entityRequests.ts";
import { formatDecimal } from "@/client/src/lib/formatNumeric.ts";
import { byName } from "@/client/src/pages/rulesets/components/byName.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import { copyProgression } from "@/shared/customization/progression.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { isRecord } from "@/shared/isRecord.ts";

/** A value as a form holds it: a field's, or a list of links' entries (a spell's spell lists, a level's saves). */
type FormValue = boolean | number | string | string[] | null | ProgressionValue | unknown[];

/** The values a form holds: any, its fields and its links among them. */
type FormValues = Partial<FormParts> & Record<string, unknown>;

/** A column of an entity's links of a role: a feat's feat pools, a spell's spell lists each at its tier, its save. */
type LinksField = Extract<EntityField, { input: "leveledLinks" | "links" | "ref" | "template" }>;

/** What levels give of something, as a progression's field holds it: a frequency, and more at the levels it names. */
type ProgressionValue = Extract<EntityField, { input: "progression" }>["default"];

/** A field of an entity's form that holds a value of its own: any but a group. */
type ValueField = Exclude<EntityField, { input: "group" }>;

/**
 * A form's values where its save sends them: its fields by the stored field that keeps each (`fields`), its links by
 * role (`links`).
 */
export interface FormParts {
  fields: Record<string, unknown>;
  links: Record<string, unknown>;
}

/** An entity's fields' values as a form holds them and a save sends them, by the stored field that keeps each. */
export type EntityFieldValues = NonNullable<
  InferRequestType<(typeof rpc.api.rulesets)[":id"]["entities"][":entityType"]["$post"]>["json"]["fields"]
>;

/** An entity a link of an entity read names, as its server sends it: its id and its name. */
export type LinkedEntity = Pick<EntityRow, "id" | "name">;

/** The columns that hold a value, each place once (`firstAtPlace`). */
function columnsByPlace(columns: readonly EntityField[]): ValueField[] {
  return firstAtPlace(columns.filter((column): column is ValueField => column.input !== "group"));
}

/**
 * A column's or a field's value as an entity read holds it: its stored field's (`field`, among its `fields`), its
 * single link's of its role (a reference's or a template's: the linked entity's id), a list of its links of its role
 * (among its `links`: each its linked entity, `toId`, at its tier where the column takes one, in their names' order),
 * or, a list the read gives by its role (a level's grants and amounts), each entry as a form sends it.
 */
function columnValueOf(column: ValueField, entity: unknown): unknown {
  if (column.field) return ownFieldOf(entity, column.field);
  if (column.input === "ref" || column.input === "template") return linksOf(column, entity)[0]?.linked.id;
  if (column.input === "links" || column.input === "leveledLinks") {
    const links = linksOf(column, entity).sort((a, b) => byName(a.linked, b.linked));
    if (column.input === "links") return links.map(({ linked }) => ({ toId: linked.id }));
    return links.map(({ linked, tier }) =>
      typeof tier === "number" ? { toId: linked.id, tier } : { toId: linked.id },
    );
  }
  const listed = column.role === undefined ? undefined : valueAt(entity, column.role);
  if (column.input !== "grants" || !Array.isArray(listed)) return listed;
  // A grant a read gives whole, its entity's row and the one it's through
  return listed.filter(isRecord).map((grant) => ({ toId: grant.id, viaId: grant.viaId }));
}

/**
 * A field's value in an empty form: false (none, for a three-state flag), a number's default, a progression's own copy
 * of its default, a choice's default or none, no text, no decimal, no reference or template, no list's items.
 */
function emptyValueOf(field: ValueField): FormValue {
  switch (field.input) {
    case "flag":
      return field.nullable ? null : false;
    case "number":
      return field.default;
    case "progression":
      return copyProgression(field.default);
    case "choice":
      return field.multiple ? [] : (field.default ?? "");
    case "text":
      return field.multiple ? [] : "";
    case "decimal":
    case "ref":
    case "template":
      return "";
    case "leveledLinks":
    case "links":
    case "grants":
    case "amounts":
      return [];
  }
}

/**
 * Of fields that share a place (an item's type, a template's narrower), the one that takes any value it holds, not one
 * that must hold one of its own: each place once.
 */
function firstAtPlace(fields: readonly ValueField[]): ValueField[] {
  const byPlace = new Map<string, ValueField>();
  for (const field of fields) {
    const held = byPlace.get(placeOf(field));
    if (!held || (held.input === "choice" && held.required)) byPlace.set(placeOf(field), field);
  }
  return [...byPlace.values()];
}

/** A field's value as a form holds it, of an entity's (`value`): its empty value when it has none (`""` for a text). */
function formValueOf(field: ValueField, value: unknown): FormValue {
  switch (field.input) {
    case "flag":
      return typeof value === "boolean" ? value : emptyValueOf(field);
    case "number":
      return typeof value === "number" ? value : emptyValueOf(field);
    case "progression":
      return isProgression(value) ? copyProgression(value) : emptyValueOf(field);
    case "decimal":
      return typeof value === "number" || typeof value === "string" ? (formatDecimal(value) ?? "") : "";
    case "leveledLinks":
    case "links":
    case "grants":
    case "amounts":
      return Array.isArray(value) ? value : [];
    case "choice":
      if (!field.multiple) {
        // One the field must hold, and a value it doesn't offer, reads as its default
        if (isOneOf(value, field.options)) return value;
        return field.required ? emptyValueOf(field) : typeof value === "string" ? value : "";
      }
      return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
    case "text":
      if (field.multiple) return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
      return typeof value === "string" ? value : "";
    default:
      return typeof value === "string" ? value : "";
  }
}

/** Whether a value is a progression's: a frequency, and the levels it gives more at, each its level and its amount. */
function isProgression(value: unknown): value is ProgressionValue {
  return (
    isRecord(value) &&
    typeof value.every === "number" &&
    Array.isArray(value.extra) &&
    value.extra.every((given) => isRecord(given) && typeof given.level === "number" && typeof given.amount === "number")
  );
}

/**
 * An entity read's links of a links column (its `role`'s, among its `links`), each its linked entity (its `toId` and
 * `toName`) and its tier, as its server sends them.
 */
function linksOf(column: LinksField, entity: unknown) {
  const links = valueAt(entity, "links");
  return (Array.isArray(links) ? links : []).flatMap((link) =>
    isRecord(link) && link.role === column.role && typeof link.toId === "string" && typeof link.toName === "string"
      ? [{ linked: { id: link.toId, name: link.toName }, tier: link.tier }]
      : [],
  );
}

/** A decimal's text as its save sends it: its number, null for none (which clears it). */
function parseDecimal(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Values at their places (`entries`), as a form holds them: each among its fields or its links. */
function partsOf(entries: [string, unknown][]): FormParts {
  const parts: FormParts = { fields: {}, links: {} };
  for (const [place, value] of entries) {
    const [part, ...key] = place.split(".");
    parts[part as keyof FormParts][key.join(".")] = value;
  }
  return parts;
}

/** A column's value as its save sends it (`value`, as its form holds it), none (null) for an empty optional one. */
function sentValueOf(column: ValueField, value: unknown): unknown {
  switch (column.input) {
    case "decimal":
      return parseDecimal(value);
    case "choice":
      return !column.multiple && !column.required && value === "" ? null : value;
    case "ref":
      return !column.required && value === "" ? null : value;
    case "template":
      return value === "" ? null : value;
    default:
      return value;
  }
}

/** The fields that hold a value, a group's among them, each place once: one shown in several groups too. */
function valueFieldsOf(fields: readonly EntityField[]): ValueField[] {
  const leaves = fields.flatMap((field) => (field.input === "group" ? valueFieldsOf(field.fields) : [field]));
  return [...new Map(leaves.map((leaf) => [placeOf(leaf), leaf])).values()];
}

/** A form's values (`values`) with others at their places (`parts`): its fields and its links over its own. */
function withParts<V extends FormValues>(values: V, parts: FormParts): V {
  return {
    ...values,
    fields: { ...values.fields, ...parts.fields },
    links: { ...values.links, ...parts.links },
  };
}

/**
 * A form's values as an edit sends them: of its fields and its links, its columns' (`columns`, sent whole) and those it
 * changed from what the form is based on (`baseline`'s). The others stay as the entity keeps them, a value its ruleset
 * no longer lists too.
 */
export function changedValues<V extends FormValues>(values: V, baseline: unknown, columns: readonly EntityField[]): V {
  const sent = new Set(columnsByPlace(columns).map(placeOf));
  const changed = (part: keyof FormParts) => {
    const held = values[part];
    if (!held) return held;
    const base = valueAt(baseline, part);
    return Object.fromEntries(
      Object.entries(held).filter(
        ([key, value]) =>
          sent.has(`${part}.${key}`) ||
          JSON.stringify(value) !== JSON.stringify(isRecord(base) ? base[key] : undefined),
      ),
    );
  };
  return { ...values, fields: changed("fields"), links: changed("links") };
}

/** A choice's options: its own, then the ones the saved form holds (`saved`) it doesn't list, which stand. */
export function choiceOptions(options: readonly (number | string)[], saved: unknown): (number | string)[] {
  const held = (Array.isArray(saved) ? saved : [saved]).filter((value) => typeof value === "string" && value !== "");
  return [...new Set([...options, ...held])];
}

/** An entity's empty fields: each field's empty value, at its place. */
export function emptyFieldValues(fields: readonly EntityField[]): FormParts {
  return partsOf(valueFieldsOf(fields).map((field) => [placeOf(field), emptyValueOf(field)]));
}

/**
 * Whether a field shows, each of its conditions' values read off the form (`watched`, at their paths, in their
 * order): while every one is among its values, or, one `except`, isn't.
 */
export function isFieldShown(field: EntityField, watched: readonly unknown[]) {
  return (field.shownWhen ?? []).every(
    (condition, index) => isOneOf(watched[index], condition.values) !== (condition.except ?? false),
  );
}

/**
 * The entities an entity read links its links columns to (their roles' links), which its form shows by name, each
 * column's in name order.
 */
export function linkedEntities(columns: readonly EntityField[], entity: unknown): LinkedEntity[] {
  return columns.flatMap((column) => poolsOf([column], entity).sort(byName));
}

/** The first choice of a select for none: "None", or "Default" when "None" is one of its values. */
export function noneLabel(options: readonly (number | string)[]) {
  return options.includes("None") ? "Default" : "None";
}

/** An entity read's own field's value (`field`, among its `fields`): none where it holds none. */
export function ownFieldOf(entity: unknown, field: string): unknown {
  const fields = valueAt(entity, "fields");
  return isRecord(fields) ? fields[field] : undefined;
}

/**
 * A form's values (`values`) of its fields (`fields`) with each one another entity holds the same emptied (`base`, its
 * description: an item's template's): what the entity holds of its own over the other's, at their places.
 */
export function ownFieldValues(fields: readonly EntityField[], values: unknown, base: unknown): FormParts {
  return partsOf(
    valueFieldsOf(fields).map((field) => {
      const value = formValueOf(field, valueAt(values, placeOf(field)));
      const same = JSON.stringify(value) === JSON.stringify(formValueOf(field, columnValueOf(field, base)));
      return [placeOf(field), same ? emptyValueOf(field) : value];
    }),
  );
}

/**
 * Where a form holds a field's value, as its save sends it: its stored field's among its fields (`fields.ITEM_TYPE`),
 * else its link's role's among its links (`links.madeFrom`).
 */
export function placeOf(field: ValueField): string {
  return field.field === undefined ? `links.${field.role ?? ""}` : `fields.${field.field}`;
}

/**
 * The pools an entity read is linked to through its pools' columns (their roles' links), as its server lists them: a
 * feat's feat pools, each a choice its pickers offer it in.
 */
export function poolsOf(columns: readonly EntityField[], entity: unknown): LinkedEntity[] {
  return columns.flatMap((column) =>
    column.input === "links" || column.input === "leveledLinks"
      ? linksOf(column, entity).map(({ linked }) => linked)
      : [],
  );
}

/** Sets a form's values at their places (`parts`: its declared fields'), each its own and dirty, the others as they are. */
export function setFormParts<T extends FieldValues>(form: Pick<UseFormReturn<T>, "setValue">, parts: FormParts) {
  for (const [part, values] of Object.entries(parts)) {
    for (const [key, value] of Object.entries(values))
      form.setValue(`${part}.${key}` as FieldPath<T>, value as never, { shouldDirty: true });
  }
}

/**
 * A form's values (`values`) as its save sends them, its columns' (`columns`, its rules') each as its body takes it: a
 * decimal its number, an optional choice, reference or template null for none, and a column its form hides (every
 * column of its place: an item's slot, its type a template's) null, which its save reads as none.
 */
export function toColumnsBody<V extends FormValues>(columns: readonly EntityField[], values: V): V {
  const shown = (column: EntityField) =>
    isFieldShown(
      column,
      (column.shownWhen ?? []).map((condition) => valueAt(values, condition.path)),
    );
  const visible = new Set(
    columns.filter((column): column is ValueField => column.input !== "group" && shown(column)).map(placeOf),
  );
  const sent = columnsByPlace(columns).map((column): [string, unknown] => {
    const place = placeOf(column);
    return [place, visible.has(place) ? sentValueOf(column, valueAt(values, place)) : null];
  });
  return withParts(values, partsOf(sent));
}

/**
 * An entity's columns, as its form holds them (`columns`, its rules'): a new one's empty values (`entity` none), else
 * those its description holds (a decimal as its text, "15.00"; one a column must hold but doesn't offer, its default;
 * its lists of links off its read's links of their roles: a feat's pools, a spell's lists each at its tier), each at
 * its place.
 */
export function toColumnValues(columns: readonly EntityField[], entity?: unknown): FormParts {
  return partsOf(
    columnsByPlace(columns).map((column) => [
      placeOf(column),
      entity === undefined ? emptyValueOf(column) : formValueOf(column, columnValueOf(column, entity)),
    ]),
  );
}

/**
 * An entity's fields as its form holds them, off its description (`entity`, which holds each at its stored field, a
 * reference at its link's role), each at its place.
 */
export function toFieldValues(fields: readonly EntityField[], entity: unknown): FormParts {
  return partsOf(
    valueFieldsOf(fields).map((field) => [placeOf(field), formValueOf(field, columnValueOf(field, entity))]),
  );
}

/** The value at a dotted path of a form's values (`fields.WEAPON_TYPE`): none where the path leads nowhere. */
export function valueAt(values: unknown, path: string): unknown {
  const [part, ...rest] = path.split(".");
  if (rest.length === 0) return isRecord(values) ? values[part] : undefined;
  // A form's part holds its values by their stored names, which hold no dot
  const held = isRecord(values) ? values[part] : undefined;
  const key = part === "fields" || part === "links" ? [rest.join(".")] : rest;
  return key.reduce<unknown>((value, each) => (isRecord(value) ? value[each] : undefined), held);
}

/**
 * A form's values (`values`) with an entity's fields as its ruleset declares them (`fields`), at their places: those
 * its description holds (`entity`), or, for a new entity, their empty values; its own until the fields load.
 */
export function withEntityFields<V extends FormValues>(
  values: V,
  fields: readonly EntityField[] | undefined,
  entity?: unknown,
): V {
  if (!fields) return withParts(values, { fields: {}, links: {} });
  return withParts(values, entity === undefined ? emptyFieldValues(fields) : toFieldValues(fields, entity));
}

/**
 * A form's values (`values`) with its fields as its ruleset declares them (`fields`), as its save sent them and its
 * server keeps them (`saved`: each at its place, a ruleset's Settings'); its own until the fields load.
 */
export function withSavedFields<V extends FormValues>(
  values: V,
  fields: readonly EntityField[] | undefined,
  saved: unknown,
): V {
  if (!fields) return withParts(values, { fields: {}, links: {} });
  return withParts(
    values,
    partsOf(valueFieldsOf(fields).map((field) => [placeOf(field), formValueOf(field, valueAt(saved, placeOf(field)))])),
  );
}
