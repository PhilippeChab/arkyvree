import type { PropertyTypesProvider } from "@/engine/core/customizations/index.ts";
import type { PropertyValue } from "@/engine/core/module/index.ts";
import type { PropertyEntityType } from "@/shared/customization/entities.ts";
import { copyProgression, countRegularAt, type ProgressionValue } from "@/shared/customization/progression.ts";

import Field, { type Fields, type FieldSpec, type FieldValues, type NoFields } from "./Field.ts";
import FieldForms, { type FormContext } from "./FieldForms.ts";
import type { FormField } from "./FormField.ts";

/** What a codec's rules add to its fields': when the entity keeps none of them. */
interface FieldRules<V> {
  /** Whether the entity keeps its fields at all: it stores none of their rows otherwise. */
  storesWhen?(values: Partial<V>): boolean;
}

/** A property row, as a codec reads it: its type and value, and its id when it has one. */
interface Row {
  id?: string;
  type: string;
  value: string;
}

/** A progression field's spec. */
type ProgressionSpec = Extract<FieldSpec, { kind: "progression" }>;

/**
 * An entity's fields kept in its properties, read and written by one spec (`fields`, written with `Field`): their
 * defaults, the property types that store them, the rows of an entity read into values in one pass, values written
 * back as rows (all of them, or those another's don't hold: `toOverrides`), an edit's values merged over what's kept,
 * a form's fields read as a save takes them (`parse`), and described as a form shows them (`describe`).
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

  /** The values of the fields at a level, each that doesn't count on its condition (`Field.counts`) at its default. */
  private static applyConditions(fields: Fields, values: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(values).map(([key, value]) => {
        const field = fields[key];
        return [key, !field || Field.counts(field, values) ? value : FieldCodec.defaultOf(field)];
      }),
    );
  }

  /** A field's value without a row. */
  private static defaultOf(field: FieldSpec): unknown {
    switch (field.kind) {
      case "flag":
        return field.absent;
      case "number":
        return field.default;
      case "list":
        return [];
      case "progression":
        return copyProgression(field.default);
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

  /** Rows by their type, each type's values in their order. */
  private static groupByType(rows: readonly PropertyValue[]) {
    return Map.groupBy(rows, (row) => row.type);
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
      case "progression":
        return FieldCodec.readProgression(field, values);
      default:
        return values[0] ?? null;
    }
  }

  /** The fields' values off their rows' values, by property type, each that doesn't count at its default. */
  private static readFields(fields: Fields, rows: Map<string, string[]>): Record<string, unknown> {
    const values = Object.fromEntries(
      Object.entries(fields).map(([key, field]) => [key, FieldCodec.readField(field, rows)]),
    );
    return FieldCodec.applyConditions(fields, values);
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

  /**
   * A progression off its rows' values: its frequency's first (`every:3`), its default's without one, and each level's
   * first more (`5:1`) in its bounds, giving at most its bound with its frequency's, by level; its default without any
   * row.
   */
  private static readProgression(field: ProgressionSpec, values: string[]): ProgressionValue {
    if (values.length === 0) return copyProgression(field.default);
    const every = values.map((value) => /^every:(\d+)$/.exec(value)?.[1]).find((match) => match !== undefined);
    const extra = new Map<number, number>();
    for (const value of values) {
      const match = /^(\d+):(\d+)$/.exec(value);
      if (!match) continue;
      const [level, amount] = [Number(match[1]), Number(match[2])];
      if (level >= 1 && level <= field.levels && amount >= 1 && !extra.has(level)) extra.set(level, amount);
    }
    const frequency = every === undefined ? field.default.every : Number(every);
    // A level gives at most its bound with its frequency's: what's past it reads as its bound, a level its frequency
    // fills gives none more
    for (const [level, amount] of extra) {
      const room = field.max - countRegularAt(frequency, level);
      if (room > 0) extra.set(level, Math.min(amount, room));
      else extra.delete(level);
    }
    return {
      every: frequency,
      extra: [...extra].map(([level, amount]) => ({ amount, level })).toSorted((a, b) => a.level - b.level),
    };
  }

  /** Whether two rows' values of a type hold the same values, whatever their order. */
  private static sameValues(a: readonly PropertyValue[], b: readonly PropertyValue[]) {
    const sorted = (rows: readonly PropertyValue[]) => rows.map((row) => row.value).toSorted();
    return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
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
      case "progression": {
        const { every, extra } = value as ProgressionValue;
        const rows = [`every:${every}`, ...extra.map(({ amount, level }) => `${level}:${amount}`)];
        return rows.map((row) => ({ type: field.type, value: row }));
      }
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

  /** The fields' values as rows, in the spec's order: a field not given writes none, nor one that doesn't count. */
  private static writeFields(fields: Fields, values: Record<string, unknown>): PropertyValue[] {
    const counted = FieldCodec.applyConditions(fields, values);
    return Object.entries(fields).flatMap(([key, field]) => FieldCodec.writeField(field, counted[key]));
  }

  private readonly typeSet: ReadonlySet<string>;

  /** Each field's value without a row. */
  readonly defaults: FieldValues<S>;

  /** The fields' names, in the spec's order. */
  readonly keys: (keyof S & string)[];

  /** The property types that store the fields. */
  readonly types: string[];

  /**
   * The fields as an entity type's form shows them (`entityType`, whose property types the ruleset declares with their
   * labels and values: `declarations`), in the order it declares them: its own fields before its groups'.
   */
  describe(declarations: PropertyTypesProvider, entityType: PropertyEntityType): FormField[] {
    return FieldForms.describe(this.fields, declarations.getDeclarations(entityType), declarations);
  }

  /** The values an edit keeps: what's kept, with the fields the edit gives over it (its other keys aside). */
  merge(kept: FieldValues<S>, given: Partial<FieldValues<S>>): FieldValues<S> {
    const defined = this.keys.filter((key) => given[key] !== undefined).map((key) => [key, given[key]]);
    return { ...kept, ...Object.fromEntries(defined) };
  }

  /**
   * A form's fields (`given`), as a save takes them: those it gives, each of its field's shape, a field a condition
   * leaves out dropped, a reference resolved (`FieldForms.parse`); refused as invalid otherwise.
   */
  parse(given: unknown, context: FormContext): Partial<FieldValues<S>> {
    return FieldForms.parse(this.fields, given, { ...context, kept: context.kept ?? this.defaults }) as Partial<
      FieldValues<S>
    >;
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

  /** The values, each reference the id `resolve` gives for the one it holds (the view's: a copy's for its source's). */
  resolveReferences(values: FieldValues<S>, resolve: (id: string) => string): FieldValues<S> {
    const references = Object.entries(this.fields)
      .filter(([key, field]) => field.kind === "ref" && typeof values[key] === "string")
      .map(([key]) => [key, resolve(values[key] as string)]);
    return { ...values, ...Object.fromEntries(references) };
  }

  /**
   * The values as the rows that keep them, but those of each type the base's rows (`base`: an item's template's) hold
   * already: what an entity read over another keeps of its own.
   */
  toOverrides(values: FieldValues<S>, base: FieldValues<S>): PropertyValue[] {
    const rows = this.toProperties(values);
    const baseRows = FieldCodec.groupByType(this.toProperties(base));
    return [...FieldCodec.groupByType(rows)]
      .filter(([type, typed]) => !FieldCodec.sameValues(typed, baseRows.get(type) ?? []))
      .flatMap(([, typed]) => typed);
  }

  /**
   * The values as the rows that keep them: none when the entity keeps no field (`storesWhen`), nor for a field they
   * leave out.
   */
  toProperties(values: Partial<FieldValues<S>>): PropertyValue[] {
    if (this.rules.storesWhen && !this.rules.storesWhen(values)) return [];
    return FieldCodec.writeFields(this.fields, values as Record<string, unknown>);
  }

  /** The values as a form's property write: the rows (`values`, the codec's by default), and the types they replace. */
  write(values: FieldValues<S>, rows = this.toProperties(values)): { types: string[]; values: PropertyValue[] } {
    return { types: this.types, values: rows };
  }
}
