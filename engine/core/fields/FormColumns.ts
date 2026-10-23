import { z } from "zod";

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

/** What a required list of links refuses empty on a new entity. */
const AT_LEAST_ONE_APTITUDE = "At least one aptitude must be selected";

/** The inputs an empty value is none of (an empty select, an emptied text). */
const EMPTY_AS_NONE: ReadonlySet<FormField["input"]> = new Set(["choice", "ref", "template", "text"]);

/** An entity's id. */
const ID = z.string().uuid();

/**
 * An entity's columns as a form gives them, read by their descriptions (its rules'), for a new entity or an edit:
 * - a column takes its input's values (a reference an id, a choice one of its options, a number a whole one in its
 *   bounds), several for a multiple one;
 * - none clears a nullable one (an empty text or select is none), and refuses any other;
 * - a new entity's form gives a required one, or its default fills it in, and a required list of links one link at
 *   least; an edit leaves those it doesn't give as they are.
 *
 * Columns that share a key (an item's type, a template's of its own options) take what any of them takes, required
 * when every one is: choices as one, of all their options, which a refusal names.
 */
export default class FormColumns {
  /** Columns that share a key, as one where they're all single choices (an item's type): every option of theirs. */
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

  /** A key's columns' values as one: what any of them takes, nullable when one is, required when every one is. */
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

  /** A list of links, at least one on a new entity when it's `required`. */
  private static links<T extends z.ZodType>(links: z.ZodArray<T>, required: boolean, creating: boolean) {
    return required && creating ? links.min(1, AT_LEAST_ONE_APTITUDE) : links;
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
      case "aptitudeLevels": {
        const level = z.number().int().min(column.min).max(column.max);
        const links = z.array(z.object({ id: ID, level: level.optional() }));
        return {
          nullable: false,
          required: column.required,
          schema: FormColumns.links(links, column.required, creating),
        };
      }
      case "aptitudes":
        return {
          nullable: false,
          required: column.required,
          schema: FormColumns.links(z.array(ID), column.required, creating),
        };
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
            .min(column.min ?? Number.NEGATIVE_INFINITY)
            .max(column.max ?? Number.POSITIVE_INFINITY),
        };
      case "flag":
        return { nullable: column.nullable, required: !column.nullable, schema: z.boolean() };
      case "grantedFeats":
        return {
          nullable: false,
          required: false,
          schema: z.array(z.object({ aptitudeId: ID, featId: ID, free: z.boolean().optional() })),
        };
      case "number": {
        const whole = z.number().int();
        const atLeast = column.min === undefined ? whole : whole.min(column.min);
        return {
          default: column.default ?? undefined,
          nullable: column.default === null,
          required: column.default !== null,
          schema: column.max === undefined ? atLeast : atLeast.max(column.max),
        };
      }
      case "ref":
        return { nullable: !column.required, required: column.required, schema: ID };
      case "saveBases":
        return {
          nullable: false,
          required: false,
          schema: z.array(z.object({ base: z.number().int().min(column.min).max(column.max), saveId: ID })),
        };
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
        throw new Error(`A column takes no ${column.input} input: ${column.key}`);
    }
  }

  /** The columns' schema (`columns`: their descriptions), a new entity's form's (`creating`) or an edit's. */
  static schema(columns: readonly FormField[], creating: boolean) {
    const byKey = Map.groupBy(columns, (column) => column.key);
    return z.object(
      Object.fromEntries(
        [...byKey].map(([key, shared]) => [
          key,
          FormColumns.keySchema(
            FormColumns.joinChoices(shared).map((column) => FormColumns.valueGiven(column, creating)),
          ),
        ]),
      ),
    );
  }
}
