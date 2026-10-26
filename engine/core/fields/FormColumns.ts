import { z } from "zod";

import Decimals from "./Decimals.ts";
import type { ChoiceFormField, FormField } from "./FormField.ts";

/** What a column's input takes: its value, whether none clears it, and whether a new entity's form gives it. */
interface ColumnValue {
  /** Its value when a new entity's form leaves it out. */
  default?: unknown;
  /** An empty value (an emptied text, a select's) is none. */
  emptyAsNone?: boolean;
  /** None (null, or an empty text or select) clears it. */
  nullable: boolean;
  /** A new entity's form gives it, unless it has a `default`. */
  required: boolean;
  schema: z.ZodType;
}

/** The inputs an empty value is none of (an empty select, an emptied text). */
const EMPTY_AS_NONE: ReadonlySet<FormField["input"]> = new Set(["choice", "ref", "template", "text"]);

/** An entity's id. */
const ID = z.string().uuid();

/**
 * An entity's columns as a form gives them, each where it stores it (a field's among its fields, a link's among its
 * links, by role), read by their descriptions (its rules'), for a new entity or an edit:
 * - a column takes its input's values (a reference an id, a choice one of its options, a number a whole one in its
 *   bounds, a decimal one kept to two places), several for a multiple one, a number or a decimal within what it holds
 *   exactly (`Decimals.largest`);
 * - none clears a nullable one (an empty text or select is none), and refuses any other;
 * - a new entity's form gives a required one, or its default fills it in, and a required list of links one link at
 *   least; an edit leaves those it doesn't give as they are.
 *
 * Columns that share a stored field (an item's type, a template's of its own options) take what any of them takes,
 * required when every one is: choices as one, of all their options, which a refusal names.
 */
export default class FormColumns {
  /** Columns that share a stored field, as one where they're all single choices (an item's type): every option of theirs. */
  private static joinChoices(shared: FormField[]): FormField[] {
    const choices = shared.filter((column): column is ChoiceFormField => column.input === "choice" && !column.multiple);
    if (shared.length < 2 || choices.length < shared.length) return shared;
    const [first] = choices;
    return [
      {
        ...first,
        default: choices.find((choice) => choice.default !== undefined)?.default,
        options: [...new Set(choices.flatMap((choice) => choice.options))],
        required: choices.every((choice) => choice.required),
      },
    ];
  }

  /** A stored field's columns' values as one: what any of them takes, nullable when one is, required when every one is. */
  private static keySchema(values: ColumnValue[]): z.ZodType {
    const [first, ...rest] = values.map((value) => value.schema);
    const taken = rest.length > 0 ? z.union([first, ...rest]) : first;
    const nullable = values.some((value) => value.nullable) ? taken.nullable() : taken;
    // An empty value reads as none before it's checked, so a refusal names what the input takes
    const schema = values.some((value) => value.emptyAsNone)
      ? z.preprocess((given) => (given === "" ? null : given), nullable)
      : nullable;
    const fallback = values.find((value) => value.default !== undefined)?.default;
    if (fallback !== undefined) return schema.default(fallback);
    return values.every((value) => value.required) ? schema : schema.optional();
  }

  /** A list of links, at least one on a new entity when it's `required`, its refusal saying so. */
  private static links<T extends z.ZodType>(links: z.ZodArray<T>, required: string | undefined, creating: boolean) {
    return required !== undefined && creating ? links.min(1, required) : links;
  }

  /**
   * A column's value as a form gives it (`creating`: a new entity's): its input's, an empty one none when it's
   * nullable, and a default or a requirement only on a new entity.
   */
  private static valueGiven(column: FormField, creating: boolean): ColumnValue {
    const value = FormColumns.valueOf(column, creating);
    return {
      ...value,
      default: creating ? value.default : undefined,
      emptyAsNone: value.nullable && EMPTY_AS_NONE.has(column.input),
      required: creating && value.required,
    };
  }

  /** What a column's input takes, whether none clears it, and whether a new entity's form gives it. */
  private static valueOf(column: FormField, creating: boolean): ColumnValue {
    switch (column.input) {
      case "amounts": {
        const amount = z.number().int().min(column.min).max(column.max);
        return {
          nullable: false,
          required: false,
          schema: z.array(z.strictObject({ amount, toId: ID })),
        };
      }
      case "choice": {
        const values = column.options.join(", ");
        const option = z.literal([...column.options], { error: () => `${column.label} must be one of: ${values}` });
        return {
          default: column.default,
          nullable: !column.required,
          required: column.required ?? false,
          schema: column.multiple ? z.array(option) : option,
        };
      }
      case "decimal":
        return {
          nullable: true,
          required: false,
          schema: z
            .number()
            .min(Math.max(column.min ?? -Decimals.largest(2), -Decimals.largest(2)))
            .max(Math.min(column.max ?? Decimals.largest(2), Decimals.largest(2)))
            .transform((value) => Decimals.toPlaces(value, 2)),
        };
      case "flag":
        return { nullable: column.nullable, required: !column.nullable, schema: z.boolean() };
      case "grants":
        return {
          nullable: false,
          required: false,
          schema: z.array(z.strictObject({ free: z.boolean().optional(), toId: ID, viaId: ID })),
        };
      case "leveledLinks": {
        const level = z.number().int().min(column.min).max(column.max);
        const links = z.array(z.strictObject({ tier: level.optional(), toId: ID }));
        return {
          nullable: false,
          required: column.required !== undefined,
          schema: FormColumns.links(links, column.required, creating),
        };
      }
      case "links":
        return {
          nullable: false,
          required: column.required !== undefined,
          schema: FormColumns.links(z.array(z.strictObject({ toId: ID })), column.required, creating),
        };
      case "number": {
        // A whole number, which holds exactly what's a safe integer: `int` refuses any past it, a maximum past it aside
        const whole = z.number().int();
        const atLeast = column.min === undefined ? whole : whole.min(column.min);
        const { max } = column;
        return {
          default: column.default ?? undefined,
          nullable: column.default === null,
          required: column.default !== null,
          schema: max === undefined || max >= Decimals.largest() ? atLeast : atLeast.max(max),
        };
      }
      case "ref":
        return { nullable: !column.required, required: column.required, schema: ID };
      case "template":
        return { nullable: true, required: false, schema: ID };
      case "text":
        return {
          default: column.nullable ? undefined : column.multiple ? [] : "",
          nullable: column.nullable,
          required: !column.nullable,
          schema: column.multiple ? z.array(z.string()) : z.string(),
        };
      case "group":
      case "progression":
        throw new Error(`A column takes no ${column.input} input: ${column.label}`);
    }
  }

  /**
   * The columns' shapes (`columns`: their descriptions), a new entity's form's (`creating`) or an edit's, where its form
   * sends them: a field's by its stored field (`fields`), a link's by its role (`links`).
   */
  static shapes(columns: readonly FormField[], creating: boolean): { fields: z.ZodRawShape; links: z.ZodRawShape } {
    const shapesOf = (described: FormField[], placeOf: (column: FormField) => string | undefined) =>
      Object.fromEntries(
        [...Map.groupBy(described, (column) => placeOf(column) ?? "")].map(([place, shared]) => [
          place,
          FormColumns.keySchema(
            FormColumns.joinChoices(shared).map((column) => FormColumns.valueGiven(column, creating)),
          ),
        ]),
      );
    const fields = columns.filter((column) => column.input !== "group" && column.field !== undefined);
    const links = columns.filter((column) => column.input !== "group" && column.field === undefined);
    return {
      fields: shapesOf(fields, (column) => (column.input === "group" ? undefined : column.field)),
      links: shapesOf(links, (column) => (column.input === "group" ? undefined : column.role)),
    };
  }
}
