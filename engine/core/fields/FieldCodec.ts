import { z } from "zod";

import type { PropertyValue } from "@/engine/core/module/index.ts";

import type { Fields, FieldSpec, FieldValues, NoFields } from "./Field.ts";

/** What a codec's rules add to its fields': a rule between fields, and when the entity keeps none of them. */
interface FieldRules<V> {
  /** The values as the entity keeps them, a field's value depending on another's. */
  normalize?(values: V): V;
  /** Whether the entity keeps its fields at all: it stores none of their rows otherwise. */
  storesWhen?(values: Partial<V>): boolean;
}

/** A property row, as a codec reads it: its type and value, and its id when it has one. */
type Row = { id?: string; type: string; value: string };

/**
 * An entity's fields kept in its properties, read and written by one spec (`fields`, written with `Field`): their
 * defaults, the property types that store them, the rows of an entity read into values in one pass, values written
 * back as rows, an edit's values merged over what's kept, and the shape a route validates a body's fields with.
 */
export default class FieldCodec<S extends Fields> {
  constructor(
    readonly fields: S,
    private readonly rules: FieldRules<FieldValues<S>> = {},
  ) {
    this.defaults = FieldCodec.defaultsOf(fields) as FieldValues<S>;
    this.keys = Object.keys(fields) as (keyof S & string)[];
    this.types = FieldCodec.typesOf(fields);
    this.typeSet = new Set(this.types);
  }

  /** No fields: a kind's whose properties hold none of its own, read as nothing. */
  static readonly NONE: FieldCodec<NoFields> = new FieldCodec({});

  /** A field's value without a row. */
  private static defaultOf(field: FieldSpec): unknown {
    switch (field.kind) {
      case "flag":
        return field.absent;
      case "number":
        return field.default;
      case "list":
        return [];
      case "group":
        return FieldCodec.defaultsOf(field.fields);
      default:
        return null;
    }
  }

  /** Each field's value without a row. */
  private static defaultsOf(fields: Fields): Record<string, unknown> {
    return Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, FieldCodec.defaultOf(field)]));
  }

  /** A field's value off its rows' values (`values`), in their order: what its kind reads. */
  private static readField(field: FieldSpec, rows: Map<string, string[]>): unknown {
    if (field.kind === "group") return FieldCodec.readFields(field.fields, rows);
    const values = rows.get(field.type) ?? [];
    switch (field.kind) {
      case "flag":
        return values.length === 0 ? field.absent : values.includes("true");
      case "number":
        return FieldCodec.readNumber(field, values);
      case "choice": {
        const [first] = values;
        return first !== undefined && field.values.includes(first) ? first : null;
      }
      case "list":
        return [...values];
      default:
        return values[0] ?? null;
    }
  }

  /** The fields' values off their rows' values, by property type. */
  private static readFields(fields: Fields, rows: Map<string, string[]>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, FieldCodec.readField(field, rows)]));
  }

  /** A number field's value: the first of its rows' values that's a number in its bounds, its default otherwise. */
  private static readNumber(field: Extract<FieldSpec, { kind: "number" }>, values: string[]): number | null {
    for (const value of values) {
      const number = Number(value);
      if (value.trim() === "" || !Number.isFinite(number)) continue;
      if ((field.min !== undefined && number < field.min) || (field.max !== undefined && number > field.max)) continue;
      return number;
    }
    return field.default;
  }

  /** A field's shape in a route's body: a flag a boolean, a number a whole one in its bounds, a list strings. */
  private static shapeOf(field: FieldSpec): z.ZodType {
    switch (field.kind) {
      case "flag":
        return field.absent === null ? z.boolean().nullable() : z.boolean();
      case "number": {
        let number = z.number().int();
        if (field.min !== undefined) number = number.min(field.min);
        if (field.max !== undefined) number = number.max(field.max);
        return number;
      }
      case "choice":
        return z.enum(field.values as [string, ...string[]]);
      case "list":
        return z.array(z.string());
      case "group":
        return z.object(Object.fromEntries(Object.entries(field.fields).map(([k, f]) => [k, FieldCodec.shapeOf(f)])));
      default:
        return z.string();
    }
  }

  /** The property types that store the fields, a group's too. */
  private static typesOf(fields: Fields): string[] {
    return Object.values(fields).flatMap((field) =>
      field.kind === "group" ? FieldCodec.typesOf(field.fields) : field.type,
    );
  }

  /** A field's value as its rows' values: none for no value (an empty text, a default number unless always written). */
  private static writeField(field: FieldSpec, value: unknown): PropertyValue[] {
    if (value === undefined || value === null) return [];
    switch (field.kind) {
      case "group":
        return FieldCodec.writeFields(field.fields, value as Record<string, unknown>);
      case "list":
        return (value as string[]).map((item) => ({ type: field.type, value: item }));
      case "flag":
        return field.absent === null || value === true ? [{ type: field.type, value: String(value) }] : [];
      case "number":
        return field.write === "unlessDefault" && value === field.default
          ? []
          : [{ type: field.type, value: String(value) }];
      default:
        return value === "" ? [] : [{ type: field.type, value: String(value) }];
    }
  }

  /** The fields' values as rows, in the spec's order: a field not given writes none. */
  private static writeFields(fields: Fields, values: Record<string, unknown>): PropertyValue[] {
    return Object.entries(fields).flatMap(([key, field]) => FieldCodec.writeField(field, values[key]));
  }

  private readonly typeSet: ReadonlySet<string>;

  /** Each field's value without a row. */
  readonly defaults: FieldValues<S>;

  /** The fields' names, in the spec's order. */
  readonly keys: (keyof S & string)[];

  /** The property types that store the fields. */
  readonly types: string[];

  /** The values an edit keeps: what's kept, with the fields the edit gives over it. */
  merge(kept: FieldValues<S>, given: Partial<FieldValues<S>>): FieldValues<S> {
    const defined = Object.entries(given).filter(([, value]) => value !== undefined);
    return { ...kept, ...Object.fromEntries(defined) };
  }

  /** The values as the entity keeps them, its rule between fields applied. */
  normalize(values: FieldValues<S>): FieldValues<S> {
    return this.rules.normalize ? this.rules.normalize(values) : values;
  }

  /** The fields' values off an entity's property rows (several entities' too), in one pass. */
  read(rows: readonly Row[]): FieldValues<S> {
    const byType = new Map<string, string[]>();
    for (const { type, value } of rows) {
      if (!this.typeSet.has(type)) continue;
      const values = byType.get(type);
      if (values) values.push(value);
      else byType.set(type, [value]);
    }
    return FieldCodec.readFields(this.fields, byType) as FieldValues<S>;
  }

  /** The id of the row each top-level field is read from, for an edit of that row: none without one. */
  readIds(rows: readonly Row[]): Record<keyof S, string | null> {
    return Object.fromEntries(
      Object.entries(this.fields).map(([key, field]) => [
        key,
        field.kind === "group" ? null : (rows.find((row) => row.type === field.type)?.id ?? null),
      ]),
    ) as Record<keyof S, string | null>;
  }

  /** The shape a route validates a body's fields with: each field's type, as the codec reads it. */
  shape(): { [K in keyof S]: z.ZodType<FieldValues<S>[K], FieldValues<S>[K]> };
  /** The same, each field optional: an edit's, which may leave any out. */
  shape(options: { optional: true }): {
    [K in keyof S]: z.ZodOptional<z.ZodType<FieldValues<S>[K], FieldValues<S>[K]>>;
  };
  shape(options: { optional?: boolean } = {}): Record<string, z.ZodType> {
    return Object.fromEntries(
      Object.entries(this.fields).map(([key, field]) => {
        const shape = FieldCodec.shapeOf(field);
        return [key, options.optional ? shape.optional() : shape];
      }),
    );
  }

  /** The values as the rows that keep them: none when the entity keeps no field (`storesWhen`). */
  toProperties(values: Partial<FieldValues<S>>): PropertyValue[] {
    if (this.rules.storesWhen && !this.rules.storesWhen(values)) return [];
    return FieldCodec.writeFields(this.fields, values as Record<string, unknown>);
  }

  /** The values as a save's property write: the rows, and the types they replace. */
  write(values: Partial<FieldValues<S>>): { types: string[]; values: PropertyValue[] } {
    return { types: this.types, values: this.toProperties(values) };
  }
}
