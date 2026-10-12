/**
 * An entity's fields as its ruleset declares them (the API's `fields`), as a form holds them: empty, an entity's, the
 * options a choice offers, and when one shows.
 */

import type { InferRequestType } from "hono/client";

import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { isRecord } from "@/shared/isRecord.ts";

/** A field's value, but a group's: a flag's, a number's, a text's or a choice's, a list's; null, none. */
type LeafValue = boolean | number | string | string[] | null;

/** A field of an entity's form that holds a value of its own: any but a group. */
type ValueField = Exclude<EntityField, { input: "group" }>;

/** An entity's fields' values as a form holds them and a save sends them, by name. */
export type EntityFieldValues = NonNullable<
  InferRequestType<(typeof rpc.api.rulesets)[":id"]["skills"]["$post"]>["json"]["fields"]
>;

/** A group's field's empty value: a group holds no group. */
function emptyInner(field: EntityField): LeafValue {
  return field.input === "group" ? null : emptyValueOf(field);
}

/** A field's value in an empty form: false (none, for a three-state flag), a number's default, no text, no choice. */
function emptyValueOf(field: ValueField): LeafValue {
  switch (field.input) {
    case "flag":
      return field.nullable ? null : false;
    case "number":
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
    default:
      if (field.input !== "ref" && field.multiple)
        return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
      return typeof value === "string" ? value : "";
  }
}

/** A field's name in its group's values: its key, past its group's (`weapon.damage`'s `damage`). */
function nameIn(group: { key: string }, field: { key: string }) {
  return field.key.slice(group.key.length + 1);
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

/** An entity's empty fields: each field's empty value, a group's under its name. */
export function emptyFieldValues(fields: readonly EntityField[]): EntityFieldValues {
  return Object.fromEntries(
    fields.map((field) =>
      field.input === "group"
        ? [field.key, Object.fromEntries(field.fields.map((inner) => [nameIn(field, inner), emptyInner(inner)]))]
        : [field.key, emptyValueOf(field)],
    ),
  );
}

/** Whether a field shows, its condition's value read off the form (`watched`, at its `shownWhen.path`). */
export function isFieldShown(field: EntityField, watched: unknown) {
  return !field.shownWhen || isOneOf(watched, field.shownWhen.values);
}

/** The first choice of a select for none: "None", or "Default" when "None" is one of its values. */
export function noneLabel(options: readonly string[]) {
  return options.includes("None") ? "Default" : "None";
}

/** An entity's fields as its form holds them, off its description (`entity`, which carries each by its name). */
export function toFieldValues(fields: readonly EntityField[], entity: unknown): EntityFieldValues {
  const values = isRecord(entity) ? entity : {};
  return Object.fromEntries(
    fields.map((field) => {
      if (field.input !== "group") return [field.key, formValueOf(field, values[field.key])];
      const group = values[field.key];
      const read = (inner: EntityField) =>
        inner.input === "group" ? null : formValueOf(inner, valueAt(group, nameIn(field, inner)));
      return [field.key, Object.fromEntries(field.fields.map((inner) => [nameIn(field, inner), read(inner)]))];
    }),
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
