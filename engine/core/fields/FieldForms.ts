import { z } from "zod";

import type { PropertyDeclaration, PropertyTypesProvider } from "@/engine/core/customizations/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { ViewEntities } from "@/engine/core/view/index.ts";
import type { PropertyEntityType } from "@/shared/customization/entities.ts";
import { isRecord } from "@/shared/isRecord.ts";

import Field, { type FieldCondition, type Fields, type FieldSpec } from "./Field.ts";
import type { FormField } from "./FormField.ts";

/** What fields are described with: the ruleset's property types, those the entity type declares, and their order. */
interface DescribeContext {
  declarations: PropertyTypesProvider;
  declared: Readonly<Record<string, PropertyDeclaration>>;
  ranks: ReadonlyMap<string, number>;
}

/** A field where its form shows it: its spec, its name, and where its value goes (`prefix`, before its name). */
interface Placed {
  field: FieldSpec;
  name: string;
  prefix: string;
}

/** A field of a spec that isn't a group: a value of its own, which its property type keeps. */
type LeafSpec = Exclude<FieldSpec, { kind: "group" }>;

/** What a form's fields are read with (`FieldForms.parse`). */
export interface FormContext {
  /** The ruleset's property types: those the entity type declares, the values each takes, what a reference names. */
  declarations: PropertyTypesProvider;
  /** The entity type whose fields they are, which declares their property types. */
  entityType: PropertyEntityType;
  /** What the entity keeps (an edit's, a new one's defaults), which a field's condition reads past what's given. */
  kept?: Readonly<Record<string, unknown>>;
  /** An entity's id as the view keys it, refused when the view shows none (`RequestIds.resolve`). */
  resolve(entityType: keyof ViewEntities, id: string): string;
}

/**
 * A spec's fields as forms take them: described as a form shows them (`describe`), by the ruleset's declarations of
 * their property types, and read off a form as a save takes them (`parse`).
 */
export default class FieldForms {
  /**
   * The spec's fields whose property types the entity type declares (`declared`), a group's own too: those its form
   * shows, and the only ones a save takes.
   */
  private static declaredOf(fields: Fields, declared: Readonly<Record<string, PropertyDeclaration>>): Fields {
    return Object.fromEntries(
      Object.entries(fields).flatMap(([key, field]): [string, FieldSpec][] => {
        if (field.kind !== "group") return field.type in declared ? [[key, field]] : [];
        const inner = FieldForms.declaredOf(field.fields, declared);
        return Object.keys(inner).length > 0 ? [[key, { ...field, fields: inner }]] : [];
      }),
    );
  }

  /** A field that isn't a group, as a form shows it: its input, by its kind and its type's values. */
  private static describeLeaf(
    key: string,
    field: LeafSpec,
    declaration: PropertyDeclaration | undefined,
    declarations: PropertyTypesProvider,
  ): FormField {
    const base = { help: declaration?.description ?? "", key, label: declaration?.label ?? field.type };
    const options = FieldForms.valuesOf(field, declarations);
    switch (field.kind) {
      case "flag":
        return { ...base, input: "flag", nullable: field.absent === null };
      case "number":
        return { ...base, default: field.default, input: "number", max: field.max, min: field.min };
      case "ref": {
        const references = declarations.getReferencedEntityType(field.type);
        if (references) return { ...base, input: "ref", references, required: field.required };
        return { ...base, input: "text", multiple: false };
      }
      default: {
        const multiple = field.kind === "list";
        if (options) return { ...base, input: "choice", multiple, options };
        return { ...base, input: "text", multiple, placeholder: declaration?.placeholder };
      }
    }
  }

  /**
   * Fields as a form shows them (`placed`), in the order their types are declared, its own fields before its groups': a
   * group's own fields, and those of its level (`level`) that a form shows in it, under its label.
   */
  private static describePlaced(placed: Placed[], level: Fields, context: DescribeContext): FormField[] {
    const { declarations, declared, ranks } = context;
    const order = (field: FieldSpec) => (field.kind === "group" ? ranks.size : 0) + FieldForms.rankOf(field, ranks);
    return placed
      .toSorted((a, b) => order(a.field) - order(b.field))
      .map(({ field, name, prefix }): FormField => {
        const key = `${prefix}${name}`;
        const shownWhen = FieldForms.shownWhen(field.when, prefix);
        if (field.kind !== "group")
          return { ...FieldForms.describeLeaf(key, field, declared[field.type], declarations), shownWhen };
        const guests = Object.entries(level).filter(([, guest]) => guest.shownIn?.includes(name));
        const inner = [
          ...FieldForms.placedAt(field.fields, `${key}.`),
          ...guests.map(([guestName, guest]) => ({ field: guest, name: guestName, prefix })),
        ];
        return {
          fields: FieldForms.describePlaced(inner, field.fields, context),
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

  /** A field's place in its form: its declared type's rank, a group's first field's. */
  private static rankOf(field: FieldSpec, ranks: ReadonlyMap<string, number>): number {
    if (field.kind !== "group") return ranks.get(field.type) ?? ranks.size;
    return Math.min(ranks.size, ...Object.values(field.fields).map((inner) => FieldForms.rankOf(inner, ranks)));
  }

  /** Refuses the keys a form gives that name no field its entity type declares, each by its own. */
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
      const entityType = context.declarations.getReferencedEntityType(field.type);
      values[key] = value === "" ? null : entityType ? context.resolve(entityType, value) : value;
    }
    return values;
  }

  /** An object of each field's shape (`shapeOf`) and no other key, each optional when a form gives those it changes. */
  private static schemaOf(fields: Fields, context: FormContext, optional: boolean) {
    const shapes = Object.entries(fields).map(([key, field]) => {
      const shape = FieldForms.shapeOf(field, context);
      return [key, optional ? shape.optional() : shape];
    });
    return z.strictObject(Object.fromEntries(shapes));
  }

  /**
   * The values a form's field takes: a flag's boolean, a number whole in its bounds, a text, a choice or a list among
   * its type's values when they're a closed list, any string otherwise, a reference any string (which names an entity,
   * read as the view's: `resolveRefs`); none (null, or `""`) for one that has none (a number without a default, a
   * reference not `required`). A group's are an object of its fields', each given, and no other.
   */
  private static shapeOf(field: FieldSpec, context: FormContext): z.ZodType {
    switch (field.kind) {
      case "group":
        return FieldForms.schemaOf(field.fields, context, false);
      case "flag":
        return field.absent === null ? z.boolean().nullable() : z.boolean();
      case "number": {
        let number = z.number().int();
        if (field.min !== undefined) number = number.min(field.min);
        if (field.max !== undefined) number = number.max(field.max);
        return field.default === null ? number.nullable() : number;
      }
      case "ref":
        return field.required ? z.string().min(1) : z.string().nullable();
      default:
        return FieldForms.valueShapeOf(field, context);
    }
  }

  /** How a form shows a field on its condition: while its condition's field (or column) holds one of its values. */
  private static shownWhen(condition: FieldCondition | undefined, prefix: string) {
    if (!condition) return undefined;
    const path = "field" in condition ? `fields.${prefix}${condition.field}` : condition.column;
    return { path, values: condition.values };
  }

  /**
   * A text's, a choice's or a list's values: among its type's, when they're a closed list, any string otherwise. None
   * is null, or `""` for one value.
   */
  private static valueShapeOf(field: LeafSpec, context: FormContext): z.ZodType {
    const values = FieldForms.valuesOf(field, context.declarations);
    const value = values ? z.enum(values as [string, ...string[]]) : z.string();
    return field.kind === "list" ? z.array(value) : z.union([value, z.literal("")]).nullable();
  }

  /** A choice's or a list's values: the ruleset's for its type, a choice's own when it declares none. */
  private static valuesOf(field: LeafSpec, declarations: PropertyTypesProvider): readonly string[] | null {
    return declarations.getValues(field.type) ?? (field.kind === "choice" ? field.values : null);
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
   * The fields of a spec (`fields`) as a form shows them, those whose property types the entity type declares
   * (`declared`), in the order it declares them: its own fields before its groups', each group's under its label, with
   * the fields of its level that a form shows in it (`Field.shownIn`), each keyed where its value goes.
   */
  static describe(
    fields: Fields,
    declared: Readonly<Record<string, PropertyDeclaration>>,
    declarations: PropertyTypesProvider,
  ): FormField[] {
    const shown = FieldForms.declaredOf(fields, declared);
    const context = { declarations, declared, ranks: new Map(Object.keys(declared).map((type, rank) => [type, rank])) };
    return FieldForms.describePlaced(FieldForms.placedAt(shown, ""), shown, context);
  }

  /**
   * A form's fields (`given`, none for a form that gives none), as a save takes them: those it gives, each a field
   * whose property type the entity type declares, of its shape (`shapeOf`: a value among its type's, when they're a
   * closed list), but a field its condition leaves out (read over what the entity keeps), which it drops, and a
   * reference the id the view keys its entity by. Refused as invalid, by field, otherwise: a key that's no declared
   * field too.
   */
  static parse(fields: Fields, given: unknown, context: FormContext): Record<string, unknown> {
    if (given === undefined) return {};
    const declared = FieldForms.declaredOf(fields, context.declarations.getDeclarations(context.entityType));
    if (isRecord(given)) FieldForms.refuseUnknown(declared, given);
    const counted = isRecord(given) ? FieldForms.withoutUncounted(declared, given, context.kept ?? {}) : given;
    const parsed = RulesError.parse(FieldForms.schemaOf(declared, context, true), counted, ["fields"]);
    return FieldForms.resolveRefs(declared, { ...parsed }, context);
  }
}
