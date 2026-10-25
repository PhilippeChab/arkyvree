import type { FieldValue } from "@/engine/core/module/index.ts";
import { copyProgression, countRoomAt, type ProgressionValue } from "@/shared/customization/progression.ts";

import Field, {
  type Fields,
  type FieldSpec,
  type FieldValues,
  type FlagSpec,
  type LeafSpec,
  type NoFields,
  type NumberSpec,
  type ProgressionSpec,
} from "./Field.ts";
import FieldForms, { type FormContext } from "./FieldForms.ts";
import type { FormField } from "./FormField.ts";
import type { FieldsWrite, StoredValues } from "./OwnerValues.ts";

/** What a codec's rules add to its fields': when the entity keeps none of them. */
interface FieldRules<V> {
  /** Whether the entity keeps its fields at all: it stores none of their rows otherwise. */
  storesWhen?(values: Partial<V>): boolean;
}

/** A write being built: each field's values and each link role's entity, by name. */
interface WriteRecord {
  fields: Record<string, FieldValue[]>;
  links: Record<string, string | null>;
}

/**
 * An entity's fields, read and written by one spec (`fields`, as its ruleset's vocabulary declares them: `FieldSpec`):
 * their defaults, the stored fields and link roles that keep them, an owner's stored values read into values (`read`),
 * values written back as what a save writes of its stored values (all of them, or those another's don't hold:
 * `toOverrides`), an edit's values merged over what's kept, a form's fields read as a save takes them (`parse`), and
 * described as a form shows them (`describe`).
 */
export default class FieldCodec<S extends Fields> {
  constructor(
    readonly fields: S,
    private readonly rules: FieldRules<FieldValues<S>> = {},
  ) {
    this.defaults = FieldCodec.defaultsOf(fields) as FieldValues<S>;
    this.keys = Object.keys(fields) as (keyof S & string)[];
    this.leaves = new Map(
      Field.leavesOf(fields).flatMap((leaf) => (leaf.kind === "ref" ? [] : [[leaf.field, leaf] as const])),
    );
  }

  /** No fields: a kind's whose entities hold none of their own, read as nothing. */
  static readonly NONE: FieldCodec<NoFields> = new FieldCodec({});

  /** A flag's value without a row: none when it tells its absence apart, false otherwise. */
  private static absentOf(field: FlagSpec) {
    return field.absent === null ? null : false;
  }

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
        return FieldCodec.absentOf(field);
      case "number":
        return field.default ?? null;
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

  /**
   * A field's value off an owner's stored values (`stored`): its field's, in their order, as its kind reads them (a
   * text's as text), or a reference's link's.
   */
  private static readField(field: FieldSpec, stored: StoredValues): unknown {
    if (field.kind === "group") return FieldCodec.readFields(field.fields, stored);
    if (field.kind === "ref") return stored.links[field.role] ?? null;
    const values = stored.fields[field.field] ?? [];
    switch (field.kind) {
      case "flag":
        return values.length === 0 ? FieldCodec.absentOf(field) : values.some((value) => String(value) === "true");
      case "number":
        return FieldCodec.readNumber(field, values);
      case "choice": {
        const first = values[0] === undefined ? undefined : String(values[0]);
        return first !== undefined && field.values.includes(first) ? first : null;
      }
      case "list":
        return values.map(String);
      case "progression":
        return FieldCodec.readProgression(field, values.map(String));
      default:
        return values[0] === undefined ? null : String(values[0]);
    }
  }

  /** The fields' values off an owner's stored values, each that doesn't count at its default. */
  private static readFields(fields: Fields, stored: StoredValues): Record<string, unknown> {
    const values = Object.fromEntries(
      Object.entries(fields).map(([key, field]) => [key, FieldCodec.readField(field, stored)]),
    );
    return FieldCodec.applyConditions(fields, values);
  }

  /** A number field's value: the first of its values that's a number in its bounds (as text too), its default otherwise. */
  private static readNumber(field: NumberSpec, values: readonly FieldValue[]): number | null {
    for (const value of values) {
      const number = typeof value === "number" ? value : Number(value);
      if (typeof value === "boolean" || String(value).trim() === "" || !Number.isFinite(number)) continue;
      if ((field.min !== undefined && number < field.min) || (field.max !== undefined && number > field.max)) continue;
      return number;
    }
    return field.default ?? null;
  }

  /**
   * A progression off its rows' values: its frequency's first (`every:3`), and each level's first more (`5:1`) in its
   * bounds, giving at most its bound with its frequency's, by level; its default without a frequency in its bounds.
   */
  private static readProgression(field: ProgressionSpec, values: string[]): ProgressionValue {
    const every = values.map((value) => /^every:(\d+)$/.exec(value)?.[1]).find((match) => match !== undefined);
    // Its rows stand for the whole together: without a frequency in its bounds, as a number past its bounds, its default
    if (every === undefined || Number(every) > field.levels) return copyProgression(field.default);
    const extra = new Map<number, number>();
    for (const value of values) {
      const match = /^(\d+):(\d+)$/.exec(value);
      if (!match) continue;
      const [level, amount] = [Number(match[1]), Number(match[2])];
      if (level >= 1 && level <= field.levels && amount >= 1 && !extra.has(level)) extra.set(level, amount);
    }
    const frequency = Number(every);
    // A level gives at most its bound with its frequency's: what's past it reads as its bound, a level its frequency
    // fills gives none more
    for (const [level, amount] of extra) {
      const room = countRoomAt(frequency, level, field.max);
      if (room > 0) extra.set(level, Math.min(amount, room));
      else extra.delete(level);
    }
    return {
      every: frequency,
      extra: [...extra].map(([level, amount]) => ({ amount, level })).toSorted((a, b) => a.level - b.level),
    };
  }

  /** Whether two sets of values hold the same values, whatever their order. */
  private static sameValues(a: readonly FieldValue[], b: readonly FieldValue[]) {
    const sorted = (values: readonly FieldValue[]) => values.map(String).toSorted();
    return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
  }

  /**
   * A field's value into a write (`write`): its field's values (none for no value: an empty text, a default number
   * unless always written; a list's each once), or a reference's link's entity (none for no value). A field without a
   * value writes none.
   */
  private static writeField(field: FieldSpec, value: unknown, write: WriteRecord) {
    if (value === undefined || value === null) return;
    switch (field.kind) {
      case "group":
        FieldCodec.writeFields(field.fields, value as Record<string, unknown>, write);
        return;
      case "ref":
        if (value !== "") write.links[field.role] = String(value);
        return;
      case "list":
        write.fields[field.field] = [...new Set(value as string[])];
        return;
      case "progression": {
        const { every, extra } = value as ProgressionValue;
        write.fields[field.field] = [`every:${every}`, ...extra.map(({ amount, level }) => `${level}:${amount}`)];
        return;
      }
      case "flag":
        if (field.absent === null || value === true) write.fields[field.field] = [value as boolean];
        return;
      case "number":
        if (field.write === "always" || value !== field.default) write.fields[field.field] = [value as number];
        return;
      default:
        if (value !== "") write.fields[field.field] = [String(value)];
    }
  }

  /** The fields' values into a write, in the spec's order: a field not given writes none, nor one that doesn't count. */
  private static writeFields(fields: Fields, values: Record<string, unknown>, write: WriteRecord) {
    const counted = FieldCodec.applyConditions(fields, values);
    for (const [key, field] of Object.entries(fields)) FieldCodec.writeField(field, counted[key], write);
  }

  /** The fields' leaves its owner's stored fields keep (a reference's is a link's), by the field that keeps each. */
  private readonly leaves: ReadonlyMap<string, LeafSpec>;

  /** Each field's value without a row. */
  readonly defaults: FieldValues<S>;

  /** The fields' names, in the spec's order. */
  readonly keys: (keyof S & string)[];

  /**
   * The values as a write of their owner's stored values: every field and link role of the fields they give (a group's
   * all), none of them kept (`storesWhen`) or a value's own, each value's of its kind (a number's a number, a flag's a
   * flag).
   */
  private writeOf(values: Partial<FieldValues<S>>): WriteRecord {
    const write: WriteRecord = { fields: {}, links: {} };
    const given = Object.entries(this.fields).filter(([key]) => values[key] !== undefined);
    for (const leaf of Field.leavesOf(Object.fromEntries(given))) {
      if (leaf.kind === "ref") write.links[leaf.role] = null;
      else write.fields[leaf.field] = [];
    }
    if (this.rules.storesWhen && !this.rules.storesWhen(values)) return write;
    FieldCodec.writeFields(this.fields, values as Record<string, unknown>, write);
    return write;
  }

  /**
   * The fields as the entity's form shows them, labeled and explained as they're declared, in their order: its own
   * fields before its groups'.
   */
  describe(): FormField[] {
    return FieldForms.describe(this.fields);
  }

  /** The values an edit keeps: what's kept, with the fields the edit gives over it (its other keys aside). */
  merge(kept: FieldValues<S>, given: Partial<FieldValues<S>>): FieldValues<S> {
    const defined = this.keys.filter((key) => given[key] !== undefined).map((key) => [key, given[key]]);
    return { ...kept, ...Object.fromEntries(defined) };
  }

  /**
   * The values a stored field of the codec's takes, as text, in their order, when they're a closed list (a flag's, true
   * and false): none for a free one, or a field it doesn't declare.
   */
  optionsOf(field: string): readonly string[] | null {
    const leaf = this.leaves.get(field);
    return leaf ? Field.closedValuesOf(leaf) : null;
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

  /** The fields' values off an owner's stored values (`stored`: its fields' and the links they read). */
  read(stored: StoredValues): FieldValues<S> {
    return FieldCodec.readFields(this.fields, stored) as FieldValues<S>;
  }

  /** The values, each reference the id `resolve` gives for the one it holds (the view's: a copy's for its source's). */
  resolveReferences(values: FieldValues<S>, resolve: (id: string) => string): FieldValues<S> {
    const references = Object.entries(this.fields)
      .filter(([key, field]) => field.kind === "ref" && typeof values[key] === "string")
      .map(([key]) => [key, resolve(values[key] as string)]);
    return { ...values, ...Object.fromEntries(references) };
  }

  /**
   * The values as a write of their owner's stored values, but each field and link the base's (`base`: an item's
   * template's) hold alike, which it clears: what an entity read over another keeps of its own.
   */
  toOverrides(values: FieldValues<S>, base: FieldValues<S>): FieldsWrite {
    const write = this.writeOf(values);
    const baseWrite = this.writeOf(base);
    for (const [field, written] of Object.entries(write.fields))
      if (FieldCodec.sameValues(written, baseWrite.fields[field])) write.fields[field] = [];
    for (const [role, toId] of Object.entries(write.links))
      if (toId === baseWrite.links[role]) write.links[role] = null;
    return write;
  }

  /**
   * The values as a write of their owner's stored values: every field and link role of the fields they give, each
   * replaced by its value's (none when the entity keeps no field, `storesWhen`, or for a value that writes none); a
   * field they leave out isn't named, so its owner keeps it. A save's values give every field: it names them all.
   */
  write(values: Partial<FieldValues<S>>): FieldsWrite {
    return this.writeOf(values);
  }
}
