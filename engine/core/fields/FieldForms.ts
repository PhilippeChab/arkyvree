import { z } from "zod";

import RulesError from "@/engine/core/RulesError.ts";
import type { ViewKinds } from "@/engine/core/view/index.ts";
import type {
  ChoiceSpec,
  FieldCondition,
  LinksSpec,
  ListSpec,
  NumberSpec,
  ProgressionSpec,
  TextSpec,
} from "@/shared/customization/fields.ts";
import { copyProgression, findProgressionIssues } from "@/shared/customization/progression.ts";
import { isRecord } from "@/shared/isRecord.ts";

import Decimals from "./Decimals.ts";
import Field, { type Fields, type FieldSpec, type LeafSpec } from "./Field.ts";
import type { EntityLinkEntry, FormField } from "./FormField.ts";

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

/** How a form shows a field on its conditions: while its value at `path` is in `values`, or, `except`, isn't. */
type ShownWhen = NonNullable<FormField["shownWhen"]>[number];

/** A field whose value may be among a closed list of them: a choice, a list, a text. */
type ValuesSpec = ChoiceSpec | ListSpec | TextSpec;

/** What a form's fields are read with (`FieldForms.parse`). */
export interface FormContext {
  /** A new entity's form, which gives what its required fields need (none: an edit's, which keeps what it leaves out) */
  creating?: boolean;
  /** What the entity keeps (an edit's, a new one's defaults), which a field's condition reads past what's given. */
  kept?: Readonly<Record<string, unknown>>;
  /** An entity's id as the view keys it, refused when the view shows none (`RequestIds.resolve`). */
  resolve(entityType: keyof ViewKinds, id: string): string;
  /** Entities' ids as the view keys them, refused when it shows none of one, or one is given twice (`resolveAll`). */
  resolveAll(entityType: keyof ViewKinds, ids: string[]): string[];
}

/** An entity's id. */
const ID = z.string().uuid();

/**
 * A spec's fields as forms take them: described as a form shows them (`describe`), by their declarations, and read off
 * a form as a save takes them (`parse`).
 */
export default class FieldForms {
  /**
   * A text's, a choice's or a number's value among its values (`values`), a refusal naming them under its field's label.
   */
  private static closedShapeOf(label: string, values: readonly (number | string)[]) {
    return z.literal([...values], { error: () => `${label} must be one of: ${values.join(", ")}` });
  }

  /**
   * A field that isn't a group, as a form shows it: its input, by its kind and its values, where its form shows it
   * (`placement`), and the stored field that keeps it (`field`), a link's role (`role`: a reference's, a list of
   * links'), which an entity read holds it at; with the input its form shows on other conditions in its place, when it
   * declares one (`narrowed`).
   */
  private static describeLeaf(field: LeafSpec): FormField[] {
    const base = {
      help: field.description,
      label: field.label,
      ...(field.kind !== "ref" && field.kind !== "links" && { field: field.field }),
      ...(field.placement && { placement: field.placement }),
    };
    switch (field.kind) {
      case "flag":
        return [{ ...base, input: "flag", nullable: field.absent === null }];
      case "number":
        return [FieldForms.describeNumber(base, field)];
      case "progression":
        return [
          {
            ...base,
            default: copyProgression(field.default),
            input: "progression",
            levels: field.levels,
            max: field.max,
          },
        ];
      case "ref":
        if (field.typeField !== undefined)
          return [{ ...base, input: "template", role: field.role, typeField: field.typeField }];
        return [
          {
            ...base,
            input: "ref",
            references: field.references,
            required: Field.isRequired(field),
            role: field.role,
          },
        ];
      case "links":
        return [FieldForms.describeLinks(base, field)];
      case "choice":
        return [
          {
            ...base,
            input: "choice",
            multiple: false,
            options: field.values,
            ...(Field.isRequired(field) && { required: true }),
          },
        ];
      default:
        return FieldForms.describeValues(base, field);
    }
  }

  /**
   * A list of links as a form shows it, by what its entries carry: their targets alone (`links`), each at a tier
   * (`leveledLinks`), with an amount (`amounts`), or through a pool (`grants`).
   */
  private static describeLinks(base: { help: string; label: string }, field: LinksSpec): FormField {
    const { references, role } = field;
    const required = field.required === undefined ? {} : { required: field.required };
    switch (field.entries) {
      case "amount":
        return { ...base, input: "amounts", max: field.max ?? 0, min: field.min ?? 0, references, role };
      case "grant":
        return { ...base, input: "grants", references, role };
      case "tier":
        return {
          ...base,
          input: "leveledLinks",
          max: field.max ?? 0,
          min: field.min ?? 0,
          references,
          ...required,
          role,
        };
      default:
        return { ...base, input: "links", references, ...required, role };
    }
  }

  /**
   * A number as a form shows it: a choice of its values, each named by its label (a hit die's, `d8`), its default held
   * by an empty form, which never leaves it at none; a decimal kept to its places, in its unit; or a whole number in its
   * bounds and its unit, none when it has no default.
   */
  private static describeNumber(base: { field?: string; help: string; label: string }, field: NumberSpec): FormField {
    if (field.values) {
      const required = Field.isRequired(field);
      return {
        ...base,
        input: "choice",
        multiple: false,
        options: field.values,
        ...(field.labels && { labels: field.labels }),
        ...(required && { default: field.default, required }),
      };
    }
    const unit = field.unit === undefined ? {} : { unit: field.unit };
    const { max } = Field.boundsOf(field);
    if (field.scale) return { ...base, input: "decimal", max, min: field.min, ...unit };
    return { ...base, default: field.default ?? null, input: "number", max, min: field.min, ...unit };
  }

  /**
   * Fields as a form shows them (`placed`), in the order of their spec's leaves (`ranks`): those beside its name first,
   * then its own fields, then its groups': a group's own fields, and those of its level that a form shows in it, under
   * its label.
   */
  private static describePlaced(placed: Placed[], ranks: ReadonlyMap<LeafSpec, number>): FormField[] {
    const order = (field: FieldSpec) => {
      const place = field.kind === "group" ? 2 : field.placement ? 0 : 1;
      return place * ranks.size + FieldForms.rankOf(field, ranks);
    };
    return placed
      .toSorted((a, b) => order(a.field) - order(b.field))
      .flatMap(({ field, level, name }): FormField[] => {
        const shownWhen = FieldForms.shownWhen(field, level);
        if (field.kind !== "group") {
          const [own, ...narrowed] = FieldForms.describeLeaf(field);
          return [{ ...own, ...(shownWhen && { shownWhen }) }, ...narrowed];
        }
        const guests = Object.entries(level).filter(([, guest]) => guest.shownIn?.includes(name));
        const inner = [
          ...FieldForms.placedAt(field.fields),
          ...guests.map(([guestName, guest]) => ({ field: guest, level, name: guestName })),
        ];
        return [
          {
            fields: FieldForms.describePlaced(inner, ranks),
            input: "group",
            label: field.label,
            ...(shownWhen && { shownWhen }),
          },
        ];
      });
  }

  /**
   * A text's, a choice's or a list's values as a form shows them: a choice of its closed list (one required offers no
   * none, an empty form holding its default), or free texts; and the input its form shows of some of its values alone,
   * on its own conditions (`narrowed`: an item template's type).
   */
  private static describeValues(base: { help: string; label: string }, field: ListSpec | TextSpec): FormField[] {
    const multiple = field.kind === "list";
    const required = field.kind === "text" && Field.isRequired(field);
    if (!field.values)
      return [{ ...base, input: "text", multiple, nullable: !required, placeholder: field.placeholder }];
    const own: FormField = {
      ...base,
      input: "choice",
      multiple,
      options: field.values,
      ...(required && { default: field.default, required }),
    };
    if (field.kind !== "text" || !field.narrowed) return [own];
    const { narrowed } = field;
    return [
      own,
      {
        ...base,
        help: narrowed.description,
        input: "choice",
        multiple: false,
        options: narrowed.values,
        ...(narrowed.required && { required: true }),
        shownWhen: narrowed.shownWhen.map((condition) => FieldForms.shownOn(condition)),
      },
    ];
  }

  /**
   * A list of links' entries, each its target and what it carries past it (a tier, an amount, a pool and whether it's
   * free), in their bounds.
   */
  private static entriesShapeOf(field: LinksSpec): z.ZodArray {
    const bounded = z
      .number()
      .int()
      .min(field.min ?? 0)
      .max(field.max ?? 0);
    switch (field.entries) {
      case "amount":
        return z.array(z.strictObject({ amount: bounded, toId: ID }));
      case "grant":
        return z.array(z.strictObject({ free: z.boolean().optional(), toId: ID, viaId: ID }));
      case "tier":
        return z.array(z.strictObject({ tier: bounded.optional(), toId: ID }));
      default:
        return z.array(z.strictObject({ toId: ID }));
    }
  }

  /**
   * Whether a field is given on a new entity's form or refused (`creating`): a required reference, a list of links that
   * needs one, a field that takes no none and has no default. None on an edit's, which keeps what it leaves out.
   */
  private static isGivenOnCreate(field: LeafSpec): boolean {
    switch (field.kind) {
      case "choice":
      case "ref":
        return Field.isRequired(field);
      case "links":
        return field.required !== undefined;
      case "text":
        return Field.isRequired(field) && field.default === undefined;
      default:
        return false;
    }
  }

  /**
   * A form's fields and links (`given`) as values by the spec's names (`fields`), a group's under its own: each leaf's
   * its stored field's (a link's, its role's), those it gives alone, and a group that gives none of its fields left
   * out.
   */
  private static nest(fields: Fields, given: FlatForm): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    for (const [name, field] of Object.entries(fields)) {
      if (field.kind === "group") {
        const inner = FieldForms.nest(field.fields, given);
        if (Object.keys(inner).length > 0) values[name] = inner;
        continue;
      }
      const { at, part } = Field.placeOf(field);
      const value = given[part][at];
      if (value !== undefined) values[name] = value;
    }
    return values;
  }

  /**
   * A number's values: whole, or kept to its places (`scale`), in its bounds and what it holds exactly
   * (`Field.boundsOf`), one of its values when they're a closed list.
   */
  private static numberShapeOf(field: NumberSpec): z.ZodType {
    if (field.values) return FieldForms.closedShapeOf(field.label, field.values);
    const { max, min } = Field.boundsOf(field);
    if (field.scale) {
      const { scale } = field;
      return z
        .number()
        .min(Math.max(min, -Decimals.largest(scale)))
        .max(max)
        .transform((value) => Decimals.toPlaces(value, scale));
    }
    // A whole number, which holds exactly what's a safe integer: `int` refuses any past it
    let number = z.number().int();
    if (field.min !== undefined) number = number.min(field.min);
    if (field.max !== undefined) number = number.max(field.max);
    return number;
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

  /**
   * The entities among the read values (`values`), each the id the view keys it by: a reference's (`""` none), a list
   * of links' targets (refused when it names one twice), and a grant's pool.
   */
  private static resolveLinks(fields: Fields, values: Record<string, unknown>, context: FormContext) {
    for (const [key, field] of Object.entries(fields)) {
      const value = values[key];
      if (field.kind === "ref" && typeof value === "string") {
        values[key] = value === "" ? null : context.resolve(field.references as keyof ViewKinds, value);
      } else if (field.kind === "links" && Array.isArray(value)) {
        const entries = value as EntityLinkEntry[];
        const type = field.references as keyof ViewKinds;
        const toIds = context.resolveAll(
          type,
          entries.map((entry) => entry.toId),
        );
        values[key] = entries.map((entry, index) => ({
          ...entry,
          toId: toIds[index],
          ...(field.via !== undefined && { viaId: context.resolve(field.via as keyof ViewKinds, entry.viaId!) }),
        }));
      }
    }
    return values;
  }

  /**
   * The values a form's field takes: a flag's boolean, a number in its bounds, whole or kept to its places, one of its
   * values when they're a closed list, a progression's (`progressionShapeOf`), a text, a choice or a list among its
   * values when they're a closed list, any string otherwise, a reference any string (which names an entity, read as the
   * view's: `resolveLinks`), a list of links' entries (`entriesShapeOf`, one at least on a new entity's form, `creating`,
   * when it's `required`); none (null, or `""`) for one a form may leave at none (not `Field.isRequired`: a number
   * without a default, a reference, a choice or a text not `required`).
   */
  private static shapeOf(field: LeafSpec, creating: boolean): z.ZodType {
    switch (field.kind) {
      case "flag":
        return Field.isRequired(field) ? z.boolean() : z.boolean().nullable();
      case "number": {
        const number = FieldForms.numberShapeOf(field);
        return Field.isRequired(field) ? number : number.nullable();
      }
      case "progression":
        return FieldForms.progressionShapeOf(field);
      case "ref":
        return Field.isRequired(field) ? z.string().min(1) : z.string().nullable();
      case "links": {
        const entries = FieldForms.entriesShapeOf(field);
        // A new entity's list needs one: an edit's may empty it
        return field.required === undefined || !creating ? entries : entries.min(1, field.required);
      }
      default:
        return FieldForms.valueShapeOf(field);
    }
  }

  /**
   * Each leaf's shape (`shapeOf`), by the stored field that keeps it (`fields`), a link's by its role (`links`):
   * optional, but one a new entity's form gives (`creating`, `isGivenOnCreate`).
   */
  private static shapesOf(fields: Fields, creating: boolean): { fields: z.ZodRawShape; links: z.ZodRawShape } {
    const shapes: Record<"fields" | "links", Record<string, z.ZodType>> = { fields: {}, links: {} };
    for (const leaf of Field.leavesOf(fields)) {
      const shape = FieldForms.shapeOf(leaf, creating);
      const { at, part } = Field.placeOf(leaf);
      shapes[part][at] = creating && FieldForms.isGivenOnCreate(leaf) ? shape : shape.optional();
    }
    return shapes;
  }

  /** A declared condition of a form's (`ShownWhen`, on a stored field), at where its form holds it. */
  private static shownOn({ except, field, values }: { except?: true; field: string; values: readonly unknown[] }) {
    return { path: `fields.${field}`, values, ...(except && { except }) } as ShownWhen;
  }

  /**
   * How a form shows a field on its conditions: while its condition's field (one at its `level`) holds one of its
   * values, at where its form holds it, and while every condition it declares of the form's values holds
   * (`shownWhen`); none for a field shown always.
   */
  private static shownWhen(field: FieldSpec, level: Fields): ShownWhen[] | undefined {
    const conditions = [
      ...(field.when ? [FieldForms.whenOf(field.when, level)] : []),
      ...(field.shownWhen ?? []).map((condition) => FieldForms.shownOn(condition)),
    ];
    return conditions.length > 0 ? conditions : undefined;
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
   * is null, or `""` for one value, unless it's `required`.
   */
  private static valueShapeOf(field: ValuesSpec): z.ZodType {
    const value = field.values ? FieldForms.closedShapeOf(field.label, field.values) : z.string();
    if (field.kind === "list") return z.array(value);
    if (Field.isRequired(field)) return value;
    return z.union([value, z.literal("")]).nullable();
  }

  /** A field's condition (`when`, on a field of its `level`) as its form reads it, at where it holds that field. */
  private static whenOf(condition: FieldCondition, level: Fields): ShownWhen {
    const on = level[condition.field];
    const at = on && on.kind !== "group" ? Field.placeOf(on) : { at: condition.field, part: "fields" };
    return { path: `${at.part}.${at.at}`, values: condition.values };
  }

  /**
   * The fields of a spec (`fields`) as a form shows them, in the order of its leaves: those beside its name first, then
   * its own fields, then its groups', each group's under its label, with the fields of its level that a form shows in
   * it (`shownIn`), each with the stored field (a link, its role) its form sends it by, labeled and explained as it
   * declares them.
   */
  static describe(fields: Fields): FormField[] {
    const ranks = new Map(Field.leavesOf(fields).map((leaf, rank) => [leaf, rank]));
    return FieldForms.describePlaced(FieldForms.placedAt(fields), ranks);
  }

  /**
   * A form's fields and links (`given`, each by the stored field or the role that keeps it; none for a form that gives
   * none), as a save takes them: those it gives, each a field of the spec, of its shape (`shapeOf`: a value among its
   * values, when they're a closed list), a new entity's those it needs (`creating`), but a field its condition leaves
   * out (read over what the entity keeps), which it drops, and each entity it names the id the view keys it by; by the
   * spec's names, a group's those it gives of its own. Refused as invalid, by field, otherwise: a key that's no field
   * too.
   */
  static parse(fields: Fields, given: GivenForm, context: FormContext): Record<string, unknown> {
    if (given.fields === undefined && given.links === undefined && !context.creating) return {};
    const shapes = FieldForms.shapesOf(fields, context.creating ?? false);
    const flat = {
      fields: FieldForms.recordOf(given.fields, "fields"),
      links: FieldForms.recordOf(given.links, "links"),
    };
    FieldForms.refuseUnknown(shapes, flat);
    const dropped = FieldForms.uncounted(fields, FieldForms.nest(fields, flat), context.kept ?? {});
    for (const leaf of Field.leavesOf(Object.fromEntries(dropped.map((name) => [name, fields[name]])))) {
      const { at, part } = Field.placeOf(leaf);
      delete flat[part][at];
    }
    const parsed = {
      fields: RulesError.parse(z.object(shapes.fields), flat.fields, ["fields"]),
      links: RulesError.parse(z.object(shapes.links), flat.links, ["links"]),
    };
    return FieldForms.resolveLinks(fields, FieldForms.nest(fields, parsed), context);
  }
}
