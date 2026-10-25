import { z } from "zod";

import RulesError from "@/engine/core/RulesError.ts";
import type { ViewEntities } from "@/engine/core/view/index.ts";
import type { ChoiceSpec, FieldCondition, ListSpec, ProgressionSpec, TextSpec } from "@/shared/customization/fields.ts";
import { copyProgression, findProgressionIssues } from "@/shared/customization/progression.ts";
import { isRecord } from "@/shared/isRecord.ts";

import Field, { type Fields, type FieldSpec, type LeafSpec } from "./Field.ts";
import type { FormField } from "./FormField.ts";

/** A field where its form shows it: its spec, its name, and where its value goes (`prefix`, before its name). */
interface Placed {
  field: FieldSpec;
  name: string;
  prefix: string;
}

/** A field whose value may be among a closed list of them: a choice, a list, a text. */
type ValuesSpec = ChoiceSpec | ListSpec | TextSpec;

/** What a form's fields are read with (`FieldForms.parse`). */
export interface FormContext {
  /** What the entity keeps (an edit's, a new one's defaults), which a field's condition reads past what's given. */
  kept?: Readonly<Record<string, unknown>>;
  /** An entity's id as the view keys it, refused when the view shows none (`RequestIds.resolve`). */
  resolve(entityType: keyof ViewEntities, id: string): string;
}

/**
 * A spec's fields as forms take them: described as a form shows them (`describe`), by their declarations, and read off
 * a form as a save takes them (`parse`).
 */
export default class FieldForms {
  /** A field that isn't a group, as a form shows it: its input, by its kind and its values. */
  private static describeLeaf(key: string, field: LeafSpec): FormField {
    const base = { help: field.description, key, label: field.label };
    switch (field.kind) {
      case "flag":
        return { ...base, input: "flag", nullable: field.absent === null };
      case "number":
        return { ...base, default: field.default ?? null, input: "number", max: field.max, min: field.min };
      case "progression":
        return {
          ...base,
          default: copyProgression(field.default),
          input: "progression",
          levels: field.levels,
          max: field.max,
        };
      case "ref":
        return { ...base, input: "ref", references: field.references, required: field.required ?? false };
      case "choice":
        return { ...base, input: "choice", multiple: false, options: field.values };
      default: {
        const multiple = field.kind === "list";
        if (field.values) return { ...base, input: "choice", multiple, options: field.values };
        return { ...base, input: "text", multiple, nullable: true, placeholder: field.placeholder };
      }
    }
  }

  /**
   * Fields as a form shows them (`placed`), in the order of their spec's leaves (`ranks`), its own fields before its
   * groups': a group's own fields, and those of its level (`level`) that a form shows in it, under its label.
   */
  private static describePlaced(placed: Placed[], level: Fields, ranks: ReadonlyMap<LeafSpec, number>): FormField[] {
    const order = (field: FieldSpec) => (field.kind === "group" ? ranks.size : 0) + FieldForms.rankOf(field, ranks);
    return placed
      .toSorted((a, b) => order(a.field) - order(b.field))
      .map(({ field, name, prefix }): FormField => {
        const key = `${prefix}${name}`;
        const shownWhen = FieldForms.shownWhen(field.when, prefix);
        if (field.kind !== "group") return { ...FieldForms.describeLeaf(key, field), shownWhen };
        const guests = Object.entries(level).filter(([, guest]) => guest.shownIn?.includes(name));
        const inner = [
          ...FieldForms.placedAt(field.fields, `${key}.`),
          ...guests.map(([guestName, guest]) => ({ field: guest, name: guestName, prefix })),
        ];
        return {
          fields: FieldForms.describePlaced(inner, field.fields, ranks),
          input: "group",
          key,
          label: field.label,
          shownWhen,
        };
      });
  }

  /** The fields of a level (`fields`, whose values go under `prefix`) a form shows on their own: those no group shows. */
  private static placedAt(fields: Fields, prefix: string): Placed[] {
    return Object.entries(fields)
      .filter(([, field]) => !field.shownIn)
      .map(([name, field]) => ({ field, name, prefix }));
  }

  /**
   * A progression's value: its frequency, whole and up to its last level (none at 0), and the levels it gives more at,
   * each once, in its bounds, giving at most its bound with its frequency's; sorted by level.
   */
  private static progressionShapeOf({ levels, max }: ProgressionSpec) {
    const extra = z.strictObject({
      amount: z.number().int().min(1).max(max),
      level: z.number().int().min(1).max(levels),
    });
    return z
      .strictObject({ every: z.number().int().min(0).max(levels), extra: z.array(extra) })
      .superRefine((value, context) => {
        for (const { index, message, part } of findProgressionIssues(value, max))
          context.addIssue({ code: "custom", path: ["extra", index, part], message });
      })
      .transform(({ every, extra: levelsGiven }) => ({
        every,
        extra: levelsGiven.toSorted((a, b) => a.level - b.level),
      }));
  }

  /** A field's place in its form: its rank among its spec's leaves, a group's first field's. */
  private static rankOf(field: FieldSpec, ranks: ReadonlyMap<LeafSpec, number>): number {
    if (field.kind !== "group") return ranks.get(field) ?? ranks.size;
    return Math.min(ranks.size, ...Object.values(field.fields).map((inner) => FieldForms.rankOf(inner, ranks)));
  }

  /** Refuses the keys a form gives that name no field of its entity, each by its own. */
  private static refuseUnknown(fields: Fields, given: Record<string, unknown>) {
    const unknown = Object.keys(given).filter((key) => !(key in fields));
    if (unknown.length === 0) return;
    throw new RulesError(
      "invalid",
      "Request validation failed",
      unknown.map((key) => ({ category: `fields.${key}`, message: "Not a field of this entity" })),
    );
  }

  /** The references among the read values (`values`), each the id the view keys its entity by; `""` none. */
  private static resolveRefs(fields: Fields, values: Record<string, unknown>, context: FormContext) {
    for (const [key, field] of Object.entries(fields)) {
      const value = values[key];
      if (field.kind !== "ref" || typeof value !== "string") continue;
      values[key] = value === "" ? null : context.resolve(field.references, value);
    }
    return values;
  }

  /** An object of each field's shape (`shapeOf`) and no other key, each optional when a form gives those it changes. */
  private static schemaOf(fields: Fields, optional: boolean) {
    const shapes = Object.entries(fields).map(([key, field]) => {
      const shape = FieldForms.shapeOf(field);
      return [key, optional ? shape.optional() : shape];
    });
    return z.strictObject(Object.fromEntries(shapes));
  }

  /**
   * The values a form's field takes: a flag's boolean, a number whole in its bounds, a progression's
   * (`progressionShapeOf`), a text, a choice or a list among its values when they're a closed list, any string
   * otherwise, a reference any string (which names an entity, read as the view's: `resolveRefs`); none (null, or `""`)
   * for one that has none (a number without a default, a reference not `required`). A group's are an object of its
   * fields', each given, and no other.
   */
  private static shapeOf(field: FieldSpec): z.ZodType {
    switch (field.kind) {
      case "group":
        return FieldForms.schemaOf(field.fields, false);
      case "flag":
        return field.absent === null ? z.boolean().nullable() : z.boolean();
      case "number": {
        let number = z.number().int();
        if (field.min !== undefined) number = number.min(field.min);
        if (field.max !== undefined) number = number.max(field.max);
        return field.default === undefined ? number.nullable() : number;
      }
      case "progression":
        return FieldForms.progressionShapeOf(field);
      case "ref":
        return field.required ? z.string().min(1) : z.string().nullable();
      default:
        return FieldForms.valueShapeOf(field);
    }
  }

  /** How a form shows a field on its condition: while its condition's field (or column) holds one of its values. */
  private static shownWhen(condition: FieldCondition | undefined, prefix: string) {
    if (!condition) return undefined;
    const path = "field" in condition ? `fields.${prefix}${condition.field}` : condition.column;
    return [{ path, values: condition.values }];
  }

  /**
   * A text's, a choice's or a list's values: among its values, when they're a closed list, any string otherwise. None
   * is null, or `""` for one value.
   */
  private static valueShapeOf(field: ValuesSpec): z.ZodType {
    const value = field.values ? z.enum(field.values as [string, ...string[]]) : z.string();
    return field.kind === "list" ? z.array(value) : z.union([value, z.literal("")]).nullable();
  }

  /** The fields a form gives, but those a condition leaves out (`Field.counts`), read over what the entity keeps. */
  private static withoutUncounted(
    fields: Fields,
    given: Record<string, unknown>,
    kept: Readonly<Record<string, unknown>>,
  ) {
    const values = { ...kept, ...given };
    return Object.fromEntries(
      Object.entries(given).filter(([key]) => !fields[key] || Field.counts(fields[key], values)),
    );
  }

  /**
   * The fields of a spec (`fields`) as a form shows them, in the order of its leaves: its own fields before its
   * groups', each group's under its label, with the fields of its level that a form shows in it (`shownIn`), each keyed
   * where its value goes, labeled and explained as it declares them.
   */
  static describe(fields: Fields): FormField[] {
    const ranks = new Map(Field.leavesOf(fields).map((leaf, rank) => [leaf, rank]));
    return FieldForms.describePlaced(FieldForms.placedAt(fields, ""), fields, ranks);
  }

  /**
   * A form's fields (`given`, none for a form that gives none), as a save takes them: those it gives, each a field of
   * the spec, of its shape (`shapeOf`: a value among its values, when they're a closed list), but a field its condition
   * leaves out (read over what the entity keeps), which it drops, and a reference the id the view keys its entity by.
   * Refused as invalid, by field, otherwise: a key that's no field too.
   */
  static parse(fields: Fields, given: unknown, context: FormContext): Record<string, unknown> {
    if (given === undefined) return {};
    if (isRecord(given)) FieldForms.refuseUnknown(fields, given);
    const counted = isRecord(given) ? FieldForms.withoutUncounted(fields, given, context.kept ?? {}) : given;
    const parsed = RulesError.parse(FieldForms.schemaOf(fields, true), counted, ["fields"]);
    return FieldForms.resolveRefs(fields, { ...parsed }, context);
  }
}
