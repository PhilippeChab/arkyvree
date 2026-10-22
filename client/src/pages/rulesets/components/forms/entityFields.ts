/**
 * An entity's fields as its ruleset declares them (the API's `fields`), as a form holds them: empty, an entity's, the
 * options a choice offers, and when one shows.
 */

import type { InferRequestType } from "hono/client";

import { formatDecimal } from "@/client/src/lib/formatNumeric.ts";
import { byName } from "@/client/src/pages/rulesets/components/byName.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import type { Aptitude } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import { copyProgression } from "@/shared/customization/progression.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { isRecord } from "@/shared/isRecord.ts";

/** A column's value: a field's, or a list of links (a spell's aptitudes, a level's saves). */
type ColumnValue = LeafValue | unknown[];

/** A field's value, but a group's: a flag's, a number's, a text's, a choice's, a list's, a progression's; null none. */
type LeafValue = boolean | number | string | string[] | null | ProgressionValue;

/** A column of a pool's links: a feat's feat pools, a spell's spell lists each at its level. */
type LinksField = Extract<EntityField, { input: "aptitudeLevels" | "aptitudes" }>;

/** What levels give of something, as a progression's field holds it: a frequency, and more at the levels it names. */
type ProgressionValue = Extract<EntityField, { input: "progression" }>["default"];

/** A field of an entity's form that holds a value of its own: any but a group. */
type ValueField = Exclude<EntityField, { input: "group" }>;

/** An entity's fields' values as a form holds them and a save sends them, by name. */
export type EntityFieldValues = NonNullable<
  InferRequestType<(typeof rpc.api.rulesets)[":id"]["skills"]["$post"]>["json"]["fields"]
>;

/**
 * The columns that hold a value, each key once: of several columns at one key (an item's type, a template's narrower),
 * the one that takes any value it holds, not one that must hold one of its own.
 */
function columnsByKey(columns: readonly EntityField[]): ValueField[] {
  const byKey = new Map<string, ValueField>();
  for (const column of columns) {
    if (column.input === "group") continue;
    const held = byKey.get(column.key);
    if (!held || (held.input === "choice" && held.required)) byKey.set(column.key, column);
  }
  return [...byKey.values()];
}

/**
 * A column's value as an entity read holds it: at its key, or, for a pool's links an entity read holds apart
 * (`links`), off them: each its aptitude's id, at its level where the column takes one, in its aptitudes' name order.
 */
function columnValueOf(column: ValueField, entity: unknown): unknown {
  const linked = (column.input === "aptitudes" || column.input === "aptitudeLevels") && !!column.links;
  if (!linked) return valueAt(entity, column.key);
  const links = linksOf(column, entity);
  if (column.input === "aptitudes") return links.map(({ aptitude }) => aptitude.id);
  return links.map(({ aptitude, level }) =>
    typeof level === "number" ? { id: aptitude.id, level } : { id: aptitude.id },
  );
}

/**
 * A field's value in an empty form: false (none, for a three-state flag), a number's default, a progression's own copy
 * of its default, a choice's default or none, no text, no decimal, no reference or template, no list's items.
 */
function emptyValueOf(field: ValueField): ColumnValue {
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
    case "aptitudeLevels":
    case "aptitudes":
    case "grantedFeats":
    case "saveBases":
      return [];
  }
}

/** A field's value as a form holds it, of an entity's (`value`): its empty value when it has none (`""` for a text). */
function formValueOf(field: ValueField, value: unknown): ColumnValue {
  switch (field.input) {
    case "flag":
      return typeof value === "boolean" ? value : emptyValueOf(field);
    case "number":
      return typeof value === "number" ? value : emptyValueOf(field);
    case "progression":
      return isProgression(value) ? copyProgression(value) : emptyValueOf(field);
    case "decimal":
      return typeof value === "number" || typeof value === "string" ? (formatDecimal(value) ?? "") : "";
    case "aptitudeLevels":
    case "aptitudes":
    case "grantedFeats":
    case "saveBases":
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

/** An entity read's link to an aptitude (`aptitudesInRule`), as its server sends it. */
function isAptitude(value: unknown): value is Aptitude {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string";
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

/** An entity read's links of a pool's links column (`links`), each its aptitude and its level, by its aptitude's name. */
function linksOf(column: LinksField, entity: unknown) {
  const links = column.links ? valueAt(entity, column.links) : undefined;
  return (Array.isArray(links) ? links : [])
    .flatMap((link) =>
      isRecord(link) && isAptitude(link.aptitudesInRule) ? [{ aptitude: link.aptitudesInRule, level: link.level }] : [],
    )
    .sort((a, b) => byName(a.aptitude, b.aptitude));
}

/** A decimal's text as its save sends it: its number, null for none (which clears it). */
function parseDecimal(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** The fields that hold a value, a group's among them, each once: one shown in several groups too. */
function valueFieldsOf(fields: readonly EntityField[]): ValueField[] {
  const leaves = fields.flatMap((field) => (field.input === "group" ? valueFieldsOf(field.fields) : [field]));
  return [...new Map(leaves.map((leaf) => [leaf.key, leaf])).values()];
}

/**
 * Values by their fields' keys (`entries`), as a form holds them: a dotted key's under its group's name
 * (`weapon.damage`), others by their own, a field shown in a group but held by the entity (an armor's max Dex) too.
 */
function valuesByKey(entries: [string, LeafValue][]): EntityFieldValues {
  const values: EntityFieldValues = {};
  const groups: Record<string, Record<string, Exclude<LeafValue, ProgressionValue>>> = {};
  for (const [key, value] of entries) {
    const [name, ...inner] = key.split(".");
    if (inner.length === 0) values[name] = value;
    // A group holds plain values: a progression is a field of its own
    else if (!isProgression(value)) values[name] = groups[name] = { ...groups[name], [inner.join(".")]: value };
  }
  return values;
}

/**
 * The fields an edit changed, as its save sends them: those whose value differs from what the form is based on
 * (`baseline`'s, a group's whole). The others stay as the entity keeps them, a value its ruleset no longer lists too.
 */
export function changedFieldValues(values: EntityFieldValues | undefined, baseline: unknown): EntityFieldValues {
  if (!values) return {};
  const base = isRecord(baseline) ? baseline : {};
  return Object.fromEntries(
    Object.entries(values).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(base[key])),
  );
}

/** A choice's options: its own, then the ones the saved form holds (`saved`) it doesn't list, which stand. */
export function choiceOptions(options: readonly (number | string)[], saved: unknown): (number | string)[] {
  const held = (Array.isArray(saved) ? saved : [saved]).filter((value) => typeof value === "string" && value !== "");
  return [...new Set([...options, ...held])];
}

/** An entity's empty fields: each field's empty value, at its key. */
export function emptyFieldValues(fields: readonly EntityField[]): EntityFieldValues {
  return valuesByKey(valueFieldsOf(fields).map((field) => [field.key, emptyValueOf(field) as LeafValue]));
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

/** The aptitudes an entity read links its pools' columns to (`links`), which its form shows by name. */
export function linkedAptitudes(columns: readonly EntityField[], entity: unknown): Aptitude[] {
  return columns.flatMap((column) =>
    column.input === "aptitudes" || column.input === "aptitudeLevels"
      ? linksOf(column, entity).map(({ aptitude }) => aptitude)
      : [],
  );
}

/** The first choice of a select for none: "None", or "Default" when "None" is one of its values. */
export function noneLabel(options: readonly (number | string)[]) {
  return options.includes("None") ? "Default" : "None";
}

/**
 * A form's values (`values`) with each one another entity holds the same emptied (`base`, its description: an item's
 * template's): what the entity holds of its own over the other's.
 */
export function ownFieldValues(fields: readonly EntityField[], values: unknown, base: unknown): EntityFieldValues {
  return valuesByKey(
    valueFieldsOf(fields).map((field) => {
      const value = formValueOf(field, valueAt(values, field.key));
      const same = JSON.stringify(value) === JSON.stringify(formValueOf(field, valueAt(base, field.key)));
      return [field.key, (same ? emptyValueOf(field) : value) as LeafValue];
    }),
  );
}

/**
 * A form's columns (`values`) as its save sends them (`columns`, its rules'): a decimal its number, an optional choice,
 * reference or template null for none, and a column its form hides (every column of its key: an item's slot, its type
 * a template's) null, which its save reads as none.
 */
export function toColumnsBody(
  columns: readonly EntityField[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const shown = (column: EntityField) =>
    isFieldShown(
      column,
      (column.shownWhen ?? []).map((condition) => valueAt(values, condition.path)),
    );
  const visibleKeys = new Set(columns.filter(shown).map((column) => column.key));
  return Object.fromEntries(
    columnsByKey(columns).map((column) => {
      const value = values[column.key];
      if (!visibleKeys.has(column.key)) return [column.key, null];
      switch (column.input) {
        case "decimal":
          return [column.key, parseDecimal(value)];
        case "choice":
          return [column.key, !column.multiple && !column.required && value === "" ? null : value];
        case "ref":
          return [column.key, !column.required && value === "" ? null : value];
        case "template":
          return [column.key, value === "" ? null : value];
        default:
          return [column.key, value];
      }
    }),
  );
}

/**
 * An entity's columns, as its form holds them (`columns`, its rules'): a new one's empty values (`entity` none), else
 * those its description holds at their keys (a decimal as its text, "15.00"; one a column must hold but doesn't offer,
 * its default). A column that's a list of links (a spell's aptitudes, a level's saves and feats) reads its description's
 * list at its key, which its owner gives in the form's shape.
 */
export function toColumnValues(columns: readonly EntityField[], entity?: unknown): Record<string, unknown> {
  return Object.fromEntries(
    columnsByKey(columns).map((column) => [
      column.key,
      entity === undefined ? emptyValueOf(column) : formValueOf(column, columnValueOf(column, entity)),
    ]),
  );
}

/** An entity's fields as its form holds them, off its description (`entity`, which carries each at its key). */
export function toFieldValues(fields: readonly EntityField[], entity: unknown): EntityFieldValues {
  return valuesByKey(
    valueFieldsOf(fields).map((field) => [field.key, formValueOf(field, valueAt(entity, field.key)) as LeafValue]),
  );
}

/** The value at a dotted path of a form's values (`fields.weapon.type`): none where the path leads nowhere. */
export function valueAt(values: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => (isRecord(value) ? value[key] : undefined), values);
}

/**
 * A form's values (`values`) with an entity's fields as its ruleset declares them (`fields`): those its description
 * holds (`entity`), or, for a new entity, their empty values; none until the fields load.
 */
export function withEntityFields<V extends { fields?: EntityFieldValues }>(
  values: V,
  fields: readonly EntityField[] | undefined,
  entity?: unknown,
): V {
  if (!fields) return { ...values, fields: {} };
  return { ...values, fields: entity === undefined ? emptyFieldValues(fields) : toFieldValues(fields, entity) };
}
