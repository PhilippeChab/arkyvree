/**
 * An entity's fields as its ruleset declares them (the API's `fields`), as a form holds them: empty, an entity's, the
 * options a choice offers, and when one shows.
 */

import type { InferRequestType } from "hono/client";

import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { isRecord } from "@/shared/isRecord.ts";

/**
 * A field's value, but a group's: a flag's, a number's, a text's or a choice's, a list's, a count per level's; null,
 * none.
 */
type LeafValue = boolean | number | number[] | string | string[] | null;

/** A field of an entity's form that holds a value of its own: any but a group. */
type ValueField = Exclude<EntityField, { input: "group" }>;

/** An entity's fields' values as a form holds them and a save sends them, by name. */
export type EntityFieldValues = NonNullable<
  InferRequestType<(typeof rpc.api.rulesets)[":id"]["skills"]["$post"]>["json"]["fields"]
>;

/**
 * A field's value in an empty form: false (none, for a three-state flag), a number's or a count per level's default, no
 * text, no choice.
 */
function emptyValueOf(field: ValueField): LeafValue {
  switch (field.input) {
    case "flag":
      return field.nullable ? null : false;
    case "number":
      return field.default;
    case "perLevel":
      return field.default;
    case "choice":
    case "text":
      return field.multiple ? [] : "";
    case "ref":
      return "";
  }
}

/** A field's value as a form holds it, of an entity's (`value`): its empty value when it has none (`""` for a text). */
function formValueOf(field: ValueField, value: unknown): LeafValue {
  switch (field.input) {
    case "flag":
      return typeof value === "boolean" ? value : emptyValueOf(field);
    case "number":
      return typeof value === "number" ? value : emptyValueOf(field);
    case "perLevel":
      return Array.isArray(value) && value.length === field.levels && value.every((count) => typeof count === "number")
        ? value
        : emptyValueOf(field);
    default:
      if (field.input !== "ref" && field.multiple)
        return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
      return typeof value === "string" ? value : "";
  }
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
  const values: Record<string, LeafValue | Record<string, LeafValue>> = {};
  for (const [key, value] of entries) {
    const [name, ...inner] = key.split(".");
    if (inner.length === 0) values[name] = value;
    else values[name] = { ...(isRecord(values[name]) ? values[name] : {}), [inner.join(".")]: value };
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
export function choiceOptions(options: readonly string[], saved: unknown): string[] {
  const held = (Array.isArray(saved) ? saved : [saved]).filter((value) => typeof value === "string" && value !== "");
  return [...new Set([...options, ...held])];
}

/** An entity's empty fields: each field's empty value, at its key. */
export function emptyFieldValues(fields: readonly EntityField[]): EntityFieldValues {
  return valuesByKey(valueFieldsOf(fields).map((field) => [field.key, emptyValueOf(field)]));
}

/** Whether a field shows, its condition's value read off the form (`watched`, at its `shownWhen.path`). */
export function isFieldShown(field: EntityField, watched: unknown) {
  return !field.shownWhen || isOneOf(watched, field.shownWhen.values);
}

/** The first choice of a select for none: "None", or "Default" when "None" is one of its values. */
export function noneLabel(options: readonly string[]) {
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
      return [field.key, same ? emptyValueOf(field) : value];
    }),
  );
}

/** An entity's fields as its form holds them, off its description (`entity`, which carries each at its key). */
export function toFieldValues(fields: readonly EntityField[], entity: unknown): EntityFieldValues {
  return valuesByKey(valueFieldsOf(fields).map((field) => [field.key, formValueOf(field, valueAt(entity, field.key))]));
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
