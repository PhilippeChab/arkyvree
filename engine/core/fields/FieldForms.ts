import { z } from "zod";

import RulesError from "@/engine/core/RulesError.ts";
import type { ViewKinds } from "@/engine/core/view/index.ts";
import type { ChoiceSpec, FieldCondition, ListSpec, ProgressionSpec, TextSpec } from "@/shared/customization/fields.ts";
import { copyProgression, findProgressionIssues } from "@/shared/customization/progression.ts";
import { isRecord } from "@/shared/isRecord.ts";

import Field, { type Fields, type FieldSpec, type LeafSpec } from "./Field.ts";
import type { FormField } from "./FormField.ts";

/** A form's fields and links, by the stored field and the role that keep each, as a save reads them. */
interface FlatForm {
  fields: Record<string, unknown>;
  links: Record<string, unknown>;
}

/** A form's fields and links as a request carries them: anything, which `parse` reads. */
interface GivenForm {
  fields?: unknown;
  links?: unknown;
}

/** A field where its form shows it: its spec, its name, and the fields at its level (`level`), its conditions' own. */
interface Placed {
  field: FieldSpec;
  level: Fields;
  name: string;
}

/** A field whose value may be among a closed list of them: a choice, a list, a text. */
type ValuesSpec = ChoiceSpec | ListSpec | TextSpec;

/** What a form's fields are read with (`FieldForms.parse`). */
export interface FormContext {
  /** What the entity keeps (an edit's, a new one's defaults), which a field's condition reads past what's given. */
  kept?: Readonly<Record<string, unknown>>;
  /** An entity's id as the view keys it, refused when the view shows none (`RequestIds.resolve`). */
  resolve(entityType: keyof ViewKinds, id: string): string;
}

/**
 * A spec's fields as forms take them: described as a form shows them (`describe`), by their declarations, and read off
 * a form as a save takes them (`parse`).
 */
export default class FieldForms {
  /**
   * A field that isn't a group, as a form shows it: its input, by its kind and its values, and the stored field that
   * keeps it (`field`), a reference's single link's role (`role`), which an entity read holds it at.
   */
  private static describeLeaf(field: LeafSpec): FormField {
    const base = {
      help: field.description,
      label: field.label,
      ...(field.kind !== "ref" && { field: field.field }),
    };
    switch (field.kind) {
      case "flag":
        return { ...base, input: "flag", nullable: field.absent === null };
      case "number":
        return {
          ...base,
          default: field.default ?? null,
          input: "number",
          max: Field.boundsOf(field).max,
          min: field.min,
        };
      case "progression":
        return {
          ...base,
          default: copyProgression(field.default),
          input: "progression",
          levels: field.levels,
          max: field.max,
        };
      case "ref":
        return {
          ...base,
          input: "ref",
          references: field.references,
          required: field.required ?? false,
          role: field.role,
        };
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
   * groups': a group's own fields, and those of its level that a form shows in it, under its label.
   */
  private static describePlaced(placed: Placed[], ranks: ReadonlyMap<LeafSpec, number>): FormField[] {
    const order = (field: FieldSpec) => (field.kind === "group" ? ranks.size : 0) + FieldForms.rankOf(field, ranks);
    return placed
      .toSorted((a, b) => order(a.field) - order(b.field))
      .map(({ field, level, name }): FormField => {
        const shownWhen = FieldForms.shownWhen(field.when, level);
        if (field.kind !== "group") return { ...FieldForms.describeLeaf(field), shownWhen };
        const guests = Object.entries(level).filter(([, guest]) => guest.shownIn?.includes(name));
        const inner = [
          ...FieldForms.placedAt(field.fields),
          ...guests.map(([guestName, guest]) => ({ field: guest, level, name: guestName })),
        ];
        return { fields: FieldForms.describePlaced(inner, ranks), input: "group", label: field.label, shownWhen };
      });
  }

  /**
   * A form's fields and links (`given`) as values by the spec's names (`fields`), a group's under its own: each leaf's
   * its stored field's (a reference's, its link's role's), those it gives alone, and a group that gives none of its
   * fields left out.
   */
  private static nest(fields: Fields, given: FlatForm): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    for (const [name, field] of Object.entries(fields)) {
      if (field.kind === "group") {
        const inner = FieldForms.nest(field.fields, given);
        if (Object.keys(inner).length > 0) values[name] = inner;
        continue;
      }
      const value = field.kind === "ref" ? given.links[field.role] : given.fields[field.field];
      if (value !== undefined) values[name] = value;
    }
    return values;
  }

  /** The fields of a level (`fields`) a form shows on their own: those no group shows. */
  private static placedAt(fields: Fields): Placed[] {
    return Object.entries(fields)
      .filter(([, field]) => !field.shownIn)
      .map(([name, field]) => ({ field, level: fields, name }));
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

  /** A form's part (`part`: its fields, its links) as an object: refused as invalid when it isn't one. */
  private static recordOf(value: unknown, part: string): Record<string, unknown> {
    if (value === undefined) return {};
    if (!isRecord(value))
      throw new RulesError("invalid", "Request validation failed", [{ category: part, message: "Expected an object" }]);
    return { ...value };
  }

  /**
   * Refuses the fields and the links a form gives (`given`) that name no field of its entity (`known`: the stored fields
   * and the roles that keep its fields), each by its own.
   */
  private static refuseUnknown(known: FlatForm, given: FlatForm) {
    const unknown = (["fields", "links"] as const).flatMap((part) =>
      Object.keys(given[part])
        .filter((key) => !Object.hasOwn(known[part], key))
        .map((key) => ({ category: `${part}.${key}`, message: "Not a field of this entity" })),
    );
    if (unknown.length > 0) throw new RulesError("invalid", "Request validation failed", unknown);
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

  /**
   * The values a form's field takes: a flag's boolean, a number whole in its bounds, a progression's
   * (`progressionShapeOf`), a text, a choice or a list among its values when they're a closed list, any string
   * otherwise, a reference any string (which names an entity, read as the view's: `resolveRefs`); none (null, or `""`)
   * for one that has none (a number without a default, a reference not `required`).
   */
  private static shapeOf(field: LeafSpec): z.ZodType {
    switch (field.kind) {
      case "flag":
        return field.absent === null ? z.boolean().nullable() : z.boolean();
      case "number": {
        // A whole number, which holds exactly what's a safe integer (`Field.boundsOf`): `int` refuses any past it
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

  /**
   * Each leaf's shape (`shapeOf`), optional, by the stored field that keeps it (`fields`), a reference's by its link's
   * role (`links`).
   */
  private static shapesOf(fields: Fields): { fields: z.ZodRawShape; links: z.ZodRawShape } {
    const leaves = Field.leavesOf(fields);
    return {
      fields: Object.fromEntries(
        leaves.flatMap((leaf) => (leaf.kind === "ref" ? [] : [[leaf.field, FieldForms.shapeOf(leaf).optional()]])),
      ),
      links: Object.fromEntries(
        leaves.flatMap((leaf) => (leaf.kind === "ref" ? [[leaf.role, FieldForms.shapeOf(leaf).optional()]] : [])),
      ),
    };
  }

  /**
   * How a form shows a field on its condition: while its condition's field (one at its `level`, or a column's stored
   * field) holds one of its values, at where its form holds it.
   */
  private static shownWhen(condition: FieldCondition | undefined, level: Fields) {
    if (!condition) return undefined;
    const field = "field" in condition ? level[condition.field] : undefined;
    const path =
      field?.kind === "ref"
        ? `links.${field.role}`
        : `fields.${field && field.kind !== "group" ? field.field : "column" in condition ? condition.column : ""}`;
    return [{ path, values: condition.values }];
  }

  /**
   * The fields a form gives (`given`, by the spec's names), but those a condition leaves out (`Field.counts`), read over
   * what the entity keeps: the names of those it leaves out.
   */
  private static uncounted(fields: Fields, given: Record<string, unknown>, kept: Readonly<Record<string, unknown>>) {
    const values = { ...kept, ...given };
    return Object.keys(given).filter((key) => fields[key] && !Field.counts(fields[key], values));
  }

  /**
   * A text's, a choice's or a list's values: among its values, when they're a closed list, any string otherwise. None
   * is null, or `""` for one value.
   */
  private static valueShapeOf(field: ValuesSpec): z.ZodType {
    const value = field.values ? z.enum(field.values as [string, ...string[]]) : z.string();
    return field.kind === "list" ? z.array(value) : z.union([value, z.literal("")]).nullable();
  }

  /**
   * The fields of a spec (`fields`) as a form shows them, in the order of its leaves: its own fields before its
   * groups', each group's under its label, with the fields of its level that a form shows in it (`shownIn`), each with
   * the stored field (a reference, the link's role) its form sends it by, labeled and explained as it declares them.
   */
  static describe(fields: Fields): FormField[] {
    const ranks = new Map(Field.leavesOf(fields).map((leaf, rank) => [leaf, rank]));
    return FieldForms.describePlaced(FieldForms.placedAt(fields), ranks);
  }

  /**
   * A form's fields and links (`given`, each by the stored field or the role that keeps it; none for a form that gives
   * none), as a save takes them: those it gives, each a field of the spec, of its shape (`shapeOf`: a value among its
   * values, when they're a closed list), but a field its condition leaves out (read over what the entity keeps), which
   * it drops, and a reference the id the view keys its entity by; by the spec's names, a group's those it gives of its
   * own. Refused as invalid, by field, otherwise: a key that's no field too.
   */
  static parse(fields: Fields, given: GivenForm, context: FormContext): Record<string, unknown> {
    if (given.fields === undefined && given.links === undefined) return {};
    const shapes = FieldForms.shapesOf(fields);
    const flat = {
      fields: FieldForms.recordOf(given.fields, "fields"),
      links: FieldForms.recordOf(given.links, "links"),
    };
    FieldForms.refuseUnknown(shapes, flat);
    const dropped = FieldForms.uncounted(fields, FieldForms.nest(fields, flat), context.kept ?? {});
    for (const leaf of Field.leavesOf(Object.fromEntries(dropped.map((name) => [name, fields[name]])))) {
      if (leaf.kind === "ref") delete flat.links[leaf.role];
      else delete flat.fields[leaf.field];
    }
    const parsed = {
      fields: RulesError.parse(z.object(shapes.fields), flat.fields, ["fields"]),
      links: RulesError.parse(z.object(shapes.links), flat.links, ["links"]),
    };
    return FieldForms.resolveRefs(fields, FieldForms.nest(fields, parsed), context);
  }
}
