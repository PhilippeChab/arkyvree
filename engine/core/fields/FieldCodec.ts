import type { FieldValue } from "@/engine/core/module/index.ts";
import type { NumberSpec, ProgressionSpec } from "@/shared/customization/fields.ts";
import { copyProgression, countRoomAt, type ProgressionValue } from "@/shared/customization/progression.ts";

import Field, {
  type Fields,
  type FieldSpec,
  type FieldValues,
  type LeafSpec,
  type NoFields,
  type PartialFieldValues,
} from "./Field.ts";
import FieldForms, { type FormContext } from "./FieldForms.ts";
import type { FormField } from "./FormField.ts";
import OwnerValues, { type FieldsWrite, type StoredValues } from "./OwnerValues.ts";

/** A write being built: each field's values and each link role's entity, by name. */
interface WriteRecord {
  fields: Record<string, FieldValue[]>;
  links: Record<string, string | null>;
}

/** The values a write takes: a field's each (a save's, read whole), or some of them (a group given whole). */
type WrittenValues<S extends Fields> = Partial<FieldValues<S>>;

/**
 * An entity's fields, read and written by one spec (`fields`, as its ruleset's vocabulary declares them: `FieldSpec`):
 * their defaults, the stored fields and link roles that keep them, an owner's values read into values (`read`), values
 * written back as what a save writes of its fields and links (all of them, or those another's don't hold:
 * `toOverrides`), and those its form shows (`formNames`: not a column's, nor one its rules alone set): an edit's merged
 * over what's kept, a form's read as a save takes them (`parse`), and described as a form shows them (`describe`).
 */
export default class FieldCodec<S extends Fields> {
  constructor(readonly fields: S) {
    this.defaults = FieldCodec.defaultsOf(fields) as FieldValues<S>;
    this.formFields = Object.fromEntries(
      Object.entries(fields).filter(([, field]) => !("form" in field && field.form)),
    ) as Fields;
    this.formNames = Object.keys(this.formFields) as (keyof S & string)[];
    this.formStored = new Set(Field.storedLeavesOf(this.formFields).map((leaf) => leaf.field));
    this.leaves = new Map(Field.storedLeavesOf(fields).map((leaf) => [leaf.field, leaf]));
  }

  /** No fields: a kind's whose entities hold none of their own, read as nothing. */
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

  /**
   * The fields' values (`values`, by name, a group's under its own), by the stored field that keeps each, in the spec's
   * order: a reference's aside, which its owner's single link keeps.
   */
  private static byStoredField(fields: Fields, values: Record<string, unknown>, out: Record<string, unknown>) {
    for (const [key, field] of Object.entries(fields)) {
      if (field.kind === "group") FieldCodec.byStoredField(field.fields, values[key] as Record<string, unknown>, out);
      else if (field.kind !== "ref") out[field.field] = values[key];
    }
    return out;
  }

  /** Each field's value without a row. */
  private static defaultsOf(fields: Fields): Record<string, unknown> {
    return Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, FieldCodec.defaultOf(field)]));
  }

  /**
   * A field's value off an owner's values (`stored`): its field's, in their order, as its kind reads them (a text's as
   * text), or a reference's single link's.
   */
  private static readField(field: FieldSpec, stored: StoredValues): unknown {
    if (field.kind === "group") return FieldCodec.readFields(field.fields, stored);
    if (field.kind === "ref") return stored.links[field.role] ?? null;
    const values = OwnerValues.valuesOf(stored.fields, field.field);
    if (values.length === 0) return FieldCodec.defaultOf(field);
    switch (field.kind) {
      case "flag":
        return values.some((value) => String(value) === "true");
      case "number":
        return FieldCodec.readNumber(field, values);
      case "choice": {
        const first = String(values[0]);
        return field.values.includes(first) ? first : null;
      }
      case "list":
        return values.map(String);
      case "progression":
        return FieldCodec.readProgression(field, values.map(String));
      default:
        return String(values[0]);
    }
  }

  /** The fields' values off an owner's fields and single links as stored, each that doesn't count at its default. */
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
   * A field's value into a write (`write`): its field's values, as every write stores them (`Field.writtenValues`: none
   * for no value, an empty text, a default number, a false flag, unless always written; a list's each once), a
   * progression's as its rows, or a reference's link's entity (none for no value). A field without a value writes none.
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
      case "progression": {
        const { every, extra } = value as ProgressionValue;
        write.fields[field.field] = [`every:${every}`, ...extra.map(({ amount, level }) => `${level}:${amount}`)];
        return;
      }
      default: {
        const stored = field.kind === "text" || field.kind === "choice" ? String(value) : value;
        const values = Field.writtenValues(field, stored);
        if (values.length > 0) write.fields[field.field] = values;
      }
    }
  }

  /** The fields' values into a write, in the spec's order: a field not given writes none, nor one that doesn't count. */
  private static writeFields(fields: Fields, values: Record<string, unknown>, write: WriteRecord) {
    const counted = FieldCodec.applyConditions(fields, values);
    for (const [key, field] of Object.entries(fields)) FieldCodec.writeField(field, counted[key], write);
  }

  /** A field's value without a row: a flag's none when it tells its absence apart, false without a default. */
  static defaultOf(field: FieldSpec): unknown {
    switch (field.kind) {
      case "flag":
        return field.default ?? (field.absent === null ? null : false);
      case "number":
      case "text":
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

  /** The fields its form shows among its own: none a column shows, nor one its rules alone set (`StoredLeafBase.form`). */
  private readonly formFields: Fields;

  /** The fields' leaves its owner's fields keep (a reference's is a link's), by the field that keeps each. */
  private readonly leaves: ReadonlyMap<string, LeafSpec>;

  /** Each field's value without a row. */
  readonly defaults: FieldValues<S>;

  /** The spec's own names of the fields its form shows (its declarations' keys, never their stored fields), in its order. */
  readonly formNames: (keyof S & string)[];

  /** The stored fields that keep those its form shows among its own. */
  readonly formStored: ReadonlySet<string>;

  /**
   * The values as a write of their owner's fields and links: every field and link role of the fields they give (a
   * group's all), each a value's own, of its kind (a number's a number, a flag's a flag); those its form shows none of
   * when the entity keeps none of them (a field it holds no value of that keeps them, `keepsForm`: a spell's school).
   */
  private writeOf(values: WrittenValues<S>): WriteRecord {
    const write: WriteRecord = { fields: {}, links: {} };
    const given = Object.entries(this.fields).filter(([key]) => values[key] !== undefined);
    for (const leaf of Field.leavesOf(Object.fromEntries(given))) {
      if (leaf.kind === "ref") write.links[leaf.role] = null;
      else write.fields[leaf.field] = [];
    }
    const kept = Field.keepersOf(this.fields).every(([key]) => !!values[key as keyof S]);
    const written = kept ? this.fields : Object.fromEntries(given.filter(([key]) => !(key in this.formFields)));
    FieldCodec.writeFields(written, values as Record<string, unknown>, write);
    return write;
  }

  /**
   * The fields as the entity's form shows them, labeled and explained as they're declared, in their order: its own
   * fields before its groups', each with the stored field that keeps it, a reference with its link's role.
   */
  describe(): FormField[] {
    return FieldForms.describe(this.formFields);
  }

  /**
   * The values a form's save keeps, of the fields its form shows (`formNames`): what's kept, with the fields the form
   * gives over it (a group's, those it gives of its own).
   */
  merge(kept: FieldValues<S>, given: PartialFieldValues<S>): Partial<FieldValues<S>> {
    const merged: Partial<FieldValues<S>> = {};
    for (const key of this.formNames) {
      const value = given[key];
      // A group's fields it gives over those kept
      const group = this.fields[key].kind === "group";
      if (value === undefined) {
        merged[key] = kept[key];
      } else {
        merged[key] = (
          group ? { ...(kept[key] as object), ...(value as object) } : value
        ) as FieldValues<S>[typeof key];
      }
    }
    return merged;
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
   * A form's fields and links (`given`: its fields by the stored field that keeps each, its references by their links'
   * roles), as a save takes them, by the spec's names: those it gives, each of its field's shape, a field a condition
   * leaves out dropped, a reference resolved (`FieldForms.parse`); refused as invalid otherwise.
   */
  parse(given: { fields?: unknown; links?: unknown }, context: FormContext): PartialFieldValues<S> {
    return FieldForms.parse(this.formFields, given, {
      ...context,
      kept: context.kept ?? this.defaults,
    }) as PartialFieldValues<S>;
  }

  /** The fields' values off an owner's values (`stored`: its fields, and its single links its references read). */
  read(stored: StoredValues): FieldValues<S> {
    return FieldCodec.readFields(this.fields, stored) as FieldValues<S>;
  }

  /**
   * The fields' values off an owner's values (`stored`), as `read` reads them, by the stored field that keeps each, in
   * the spec's order: what an entity's answer carries (a reference's aside, its single link's, among its links).
   */
  readByField(stored: StoredValues): Record<string, unknown> {
    return FieldCodec.byStoredField(this.fields, this.read(stored), {});
  }

  /** The values, each reference the id `resolve` gives for the one it holds (the view's: a copy's for its source's). */
  resolveReferences(values: FieldValues<S>, resolve: (id: string) => string): FieldValues<S> {
    const references = Object.entries(this.fields)
      .filter(([key, field]) => field.kind === "ref" && typeof values[key] === "string")
      .map(([key]) => [key, resolve(values[key] as string)]);
    return { ...values, ...Object.fromEntries(references) };
  }

  /**
   * The values of the fields its form shows, as its form holds them and its save sends them: each by the stored field
   * that keeps it (`fields`), a reference by its link's role (`links`).
   */
  toForm(values: FieldValues<S>): { fields: Record<string, unknown>; links: Record<string, unknown> } {
    const form = { fields: {} as Record<string, unknown>, links: {} as Record<string, unknown> };
    const place = (fields: Fields, level: Record<string, unknown>) => {
      for (const [key, field] of Object.entries(fields)) {
        if (field.kind === "group") place(field.fields, level[key] as Record<string, unknown>);
        else if (field.kind === "ref") form.links[field.role] = level[key];
        else form.fields[field.field] = level[key];
      }
    };
    place(this.formFields, values);
    return form;
  }

  /**
   * The values as a write of their owner's fields and links, but each field and link the base's (`base`: an item's
   * template's) hold alike, which it clears: what an entity read over another keeps of its own.
   */
  toOverrides(values: WrittenValues<S>, base: FieldValues<S>): FieldsWrite {
    const write = this.writeOf(values);
    const baseWrite = this.writeOf(base);
    for (const [field, written] of Object.entries(write.fields))
      if (FieldCodec.sameValues(written, baseWrite.fields[field])) write.fields[field] = [];
    for (const [role, toId] of Object.entries(write.links))
      if (toId === baseWrite.links[role]) write.links[role] = null;
    return write;
  }

  /**
   * The values as a write of their owner's fields and links: every field and link role of the fields they give, each
   * replaced by its value's (none for one its form shows when the entity keeps none of them, `keepsForm`, or for a
   * value that writes none); a field they leave out isn't named, so its owner keeps it. A form's save gives every field
   * it shows: it names them.
   */
  write(values: WrittenValues<S>): FieldsWrite {
    return this.writeOf(values);
  }
}
