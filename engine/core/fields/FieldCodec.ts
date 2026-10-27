import type { FieldValue, LinkSet } from "@/engine/core/module/index.ts";
import type { NumberSpec, ProgressionSpec } from "@/shared/customization/fields.ts";
import { copyProgression, countRoomAt, type ProgressionValue } from "@/shared/customization/progression.ts";

import Field, {
  type Fields,
  type FieldSpec,
  type FieldValues,
  type NoFields,
  type PartialFieldValues,
  type StoredLeaf,
} from "./Field.ts";
import FieldForms, { type FormContext } from "./FieldForms.ts";
import type { EntityLinkEntry, FormField } from "./FormField.ts";
import OwnerValues, { type FieldsWrite, type StoredValues } from "./OwnerValues.ts";

/** A write being built: each field's values and each link role's entity, by name. */
interface WriteRecord {
  fields: Record<string, FieldValue[]>;
  links: Record<string, string | null>;
}

/** The values a write takes: a field's each (a save's, read whole), or some of them (a group given whole). */
type WrittenValues<S extends Fields> = Partial<FieldValues<S>>;

/**
 * A form as a save takes it (`FieldCodec.parse`): the fields' values it gives, by the spec's names (`values`), and the
 * lists of links it sets, each of its role, every entity the view's (`lists`).
 */
export interface ParsedForm<S extends Fields> {
  lists: LinkSet[];
  values: PartialFieldValues<S>;
}

/**
 * An entity's fields, read and written by one spec (`fields`, as its ruleset's vocabulary declares them: `FieldSpec`):
 * their defaults, the stored fields and link roles that keep them, an owner's values read into values (`read`), values
 * written back as what a save writes of its fields and links (all of them, or those another's don't hold:
 * `toOverrides`), and those its form takes (`formNames`: all but those its rules alone set, `form: "hidden"`): an
 * edit's merged over what's kept, a form's read as a save takes them (`parse`, its lists of links with them), and
 * described as a form shows them (`describe`: all but those it shows no input of, `form: "unshown"`).
 */
export default class FieldCodec<S extends Fields> {
  constructor(readonly fields: S) {
    this.defaults = FieldCodec.defaultsOf(fields) as FieldValues<S>;
    const formFields = Object.entries(fields).filter(([, field]) => !("form" in field && field.form === "hidden"));
    this.formFields = Object.fromEntries(formFields) as Fields;
    this.shownFields = Object.fromEntries(
      formFields.filter(([, field]) => !("form" in field && field.form === "unshown")),
    ) as Fields;
    const valued = formFields.filter(([, field]) => field.kind !== "links");
    this.formNames = valued.map(([key]) => key) as (keyof FieldValues<S> & string)[];
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
   * order: a link's aside (a reference's, a list of links'), which its owner's links keep.
   */
  private static byStoredField(fields: Fields, values: Record<string, unknown>, out: Record<string, unknown>) {
    for (const [key, field] of Object.entries(fields)) {
      if (field.kind === "group") FieldCodec.byStoredField(field.fields, values[key] as Record<string, unknown>, out);
      else if (!Field.isLinked(field)) out[field.field] = values[key];
    }
    return out;
  }

  /** Each field's value without a row: none of a list of links, whose values are its links'. */
  private static defaultsOf(fields: Fields): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(fields).flatMap(([key, field]) =>
        field.kind === "links" ? [] : [[key, FieldCodec.defaultOf(field)]],
      ),
    );
  }

  /**
   * A field's value off an owner's values (`stored`): its field's, in their order, as its kind reads them (a text's as
   * text), or a reference's single link's.
   */
  private static readField(field: FieldSpec, stored: StoredValues): unknown {
    if (field.kind === "group") return FieldCodec.readFields(field.fields, stored);
    if (field.kind === "ref") return stored.links[field.role] ?? null;
    if (field.kind === "links") return undefined;
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

  /**
   * The fields' values off an owner's fields and single links as stored, each that doesn't count at its default: none
   * of a list of links, whose values are its links'.
   */
  private static readFields(fields: Fields, stored: StoredValues): Record<string, unknown> {
    const values = Object.fromEntries(
      Object.entries(fields).flatMap(([key, field]) =>
        field.kind === "links" ? [] : [[key, FieldCodec.readField(field, stored)]],
      ),
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
   * progression's as its rows, or a reference's link's entity (none for no value). A field without a value writes none,
   * and a list of links none of its own: its links are set apart (`ParsedForm.lists`).
   */
  private static writeField(field: FieldSpec, value: unknown, write: WriteRecord) {
    if (value === undefined || value === null) return;
    switch (field.kind) {
      case "links":
        return;
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

  /** The fields' values into a write, in the spec's order: a field not given writes none. */
  private static writeFields(fields: Fields, values: Record<string, unknown>, write: WriteRecord) {
    for (const [key, field] of Object.entries(fields)) FieldCodec.writeField(field, values[key], write);
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

  /** The fields its form takes: all but one its rules alone set (`form: "hidden"`). */
  private readonly formFields: Fields;

  /** The fields' leaves its owner's fields keep (a reference's and a list of links' are links'), by stored field. */
  private readonly leaves: ReadonlyMap<string, StoredLeaf>;

  /** The fields its form shows an input of: those it takes, but one its page gives (`form: "unshown"`). */
  private readonly shownFields: Fields;

  /** Each field's value without a row. */
  readonly defaults: FieldValues<S>;

  /**
   * The spec's own names of the fields its form takes that hold a value (its declarations' keys, never their stored
   * fields; not a list of links), in its order.
   */
  readonly formNames: (keyof FieldValues<S> & string)[];

  /**
   * The values as a write of their owner's fields and links: every field and link role of the fields they give (a
   * group's all), each a value's own, of its kind (a number's a number, a flag's a flag).
   */
  private writeOf(values: FieldValues<S> | WrittenValues<S>): WriteRecord {
    const write: WriteRecord = { fields: {}, links: {} };
    const given = Object.entries(this.fields).filter(([key]) => (values as Record<string, unknown>)[key] !== undefined);
    for (const leaf of Field.leavesOf(Object.fromEntries(given))) {
      if (leaf.kind === "ref") write.links[leaf.role] = null;
      else if (leaf.kind !== "links") write.fields[leaf.field] = [];
    }
    FieldCodec.writeFields(this.fields, values as Record<string, unknown>, write);
    return write;
  }

  /**
   * The fields as the entity's form shows them, labeled and explained as they're declared, in their order: those beside
   * its name, its own fields, then its groups', each with the stored field that keeps it, a link with its role (a
   * reference's, a list of links').
   */
  describe(): FormField[] {
    return FieldForms.describe(this.shownFields);
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
      const group = this.fields[key as keyof S].kind === "group";
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
   * A form's fields and links (`given`: its fields by the stored field that keeps each, its links by role, a
   * reference's and a list of links'), as a save takes them: those it gives, each of its field's shape, a new entity's
   * those it needs (`context.creating`), a field a condition leaves out dropped, every entity it names resolved
   * (`FieldForms.parse`); refused as invalid otherwise. Its fields' values by the spec's names, and the lists of links
   * it sets, each of its role, to entities of its kind.
   */
  parse(given: { fields?: unknown; links?: unknown }, context: FormContext): ParsedForm<S> {
    const parsed = FieldForms.parse(this.formFields, given, { ...context, kept: context.kept ?? this.defaults });
    const lists: LinkSet[] = [];
    const values: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const field = this.fields[key];
      if (field.kind === "links")
        lists.push({ links: value as EntityLinkEntry[], role: field.role, toType: field.references });
      else values[key] = value;
    }
    return { lists, values: values as PartialFieldValues<S> };
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
    const held = values as Record<string, unknown>;
    const references = Object.entries(this.fields)
      .filter(([key, field]) => field.kind === "ref" && typeof held[key] === "string")
      .map(([key]) => [key, resolve(held[key] as string)]);
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
        else if (field.kind !== "links") form.fields[field.field] = level[key];
      }
    };
    place(this.formFields, values);
    return form;
  }

  /**
   * The values as a write of their owner's fields and links, but each field it reads off the base when it holds none
   * (`inherits`) that the base's (`base`: an item's template's) holds alike, which it clears: what an entity read over
   * another keeps of its own.
   */
  toOverrides(values: WrittenValues<S>, base: FieldValues<S>): FieldsWrite {
    const write = this.writeOf(values);
    const baseWrite = this.writeOf(base);
    for (const [field, written] of Object.entries(write.fields)) {
      if (this.leaves.get(field)?.inherits && FieldCodec.sameValues(written, baseWrite.fields[field]))
        write.fields[field] = [];
    }
    return write;
  }

  /**
   * The values as a write of their owner's fields and links: every field and link role of the fields they give, each
   * replaced by its value's (none for a value that writes none); a field they leave out isn't named, so its owner keeps
   * it. A form's save gives every field it shows: it names them. What the write path stores of it applies the rules
   * past each value's own (`FieldWrites`): a field whose condition doesn't hold at its default, none of those its form
   * shows without a value of one that keeps them (`keepsForm`).
   */
  write(values: WrittenValues<S>): FieldsWrite {
    return this.writeOf(values);
  }
}
