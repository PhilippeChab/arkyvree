import { Field, type Fields } from "@/engine/core/fields/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { ChoiceSpec, NumberSpec, TextSpec } from "@/shared/customization/fields.ts";

import type { FieldInput, SheetField } from "./blocks.ts";
import type { CreationField } from "./descriptions.ts";
import type { FieldsRequest } from "./requests.ts";

/** A character's own field its forms show an input of: a number, a choice, or a text (a select among its values). */
type InputSpec = ChoiceSpec | NumberSpec | TextSpec;

/**
 * A character's own fields (its module's `characterFields`) as its forms take them: each one's input, which its sheet's
 * `fields` block and a new character's form describe alike, by its declaration, and what its create and its edit take
 * of those its forms never leave at none (`Field.isRequired`, as an entity's form reads them). A character's forms take
 * them otherwise than an entity's in two ways, each said here: its create gives each (`parseNew`), and its edit keeps a
 * select it sends unset (`sentOf`).
 */
export default class FieldInputs {
  /**
   * A character's field's input (`field`, as it's declared), keyed by the stored field that keeps it and labeled as it's
   * declared: a whole number at least its least, a select of its values, or a text with its example; one its forms
   * never leave at none required (`<Label> is required`).
   */
  private static inputOf(field: InputSpec): FieldInput {
    const { field: key, label } = field;
    const required = Field.isRequired(field) ? { required: `${label} is required` } : {};
    if (field.kind === "number") return { key, kind: "number", label, min: Field.boundsOf(field).min, ...required };
    if (field.values) return { key, kind: "select", label, options: [...field.values], ...required };
    const placeholder = field.kind === "text" ? field.placeholder : undefined;
    return { key, kind: "text", label, ...(placeholder !== undefined && { placeholder }) };
  }

  /**
   * A character's field (`field`, as it's declared) as a new character's form shows it (`inputOf`), a number starting
   * at its default; `shown`, what its form adds: a select that narrows its creation picks (`narrows`), a number whose
   * input's arrows stop at its least (`stepped`).
   */
  static creationFieldOf(field: InputSpec, shown: { narrows?: true; stepped?: true } = {}): CreationField {
    const input = FieldInputs.inputOf(field);
    if (input.kind === "number") {
      const start = field.kind === "number" && field.default !== undefined ? { start: field.default } : {};
      return { ...input, ...start, ...(shown.stepped && { stepped: true }) };
    }
    if (input.kind === "select") return { ...input, ...(shown.narrows && { narrows: true }) };
    return input;
  }

  /**
   * A new character's fields (`given`, by the stored field that keeps each) as its codec reads them (`parse`), refused
   * as invalid with every field of `fields` its forms never leave at none that it leaves out (`<Label> is required`),
   * together with what the codec refuses. An entity's create takes such a field's default when it gives none, its form
   * starting at it; a new character's form starts its selects unset, for its player to pick (3.5's alignment and
   * gender, which narrow its race), so its create gives each.
   */
  static parseNew<T>(fields: Fields, given: FieldsRequest, parse: (given: FieldsRequest) => T): T {
    const missing = Field.storedLeavesOf(fields)
      .filter((leaf) => Field.isRequired(leaf) && given[leaf.field] === undefined)
      .map((leaf) => ({ category: `fields.${leaf.field}`, message: `${leaf.label} is required` }));
    try {
      const values = parse(given);
      if (missing.length === 0) return values;
    } catch (error) {
      if (!(error instanceof RulesError) || missing.length === 0) throw error;
      throw new RulesError("invalid", error.message, [...missing, ...(error.issues ?? [])]);
    }
    throw new RulesError("invalid", "Request validation failed", missing);
  }

  /**
   * What an edit of a character's fields (`given`, by the stored field that keeps each) sends its codec: each, but a
   * select of `fields` its forms never leave at none that it sends unset (null), which it leaves as it is, since its
   * sheet shows a value off its options unset, and sends it so. A number sent unset, its codec refuses.
   */
  static sentOf(fields: Fields, given: FieldsRequest): FieldsRequest {
    const kept = new Set(
      Field.storedLeavesOf(fields).flatMap((leaf) =>
        (leaf.kind === "choice" || leaf.kind === "text") && leaf.values && Field.isRequired(leaf) ? [leaf.field] : [],
      ),
    );
    return Object.fromEntries(Object.entries(given).filter(([field, value]) => value !== null || !kept.has(field)));
  }

  /**
   * A character's field (`field`, as it's declared) as its sheet's `fields` block shows it (`inputOf`), holding `value`
   * (the character's): a number's, its default when it holds none; a select's, none when its options don't hold it; a
   * text's, empty when it holds none.
   */
  static sheetFieldOf(field: InputSpec, value: unknown): SheetField {
    const input = FieldInputs.inputOf(field);
    switch (input.kind) {
      case "number": {
        const fallback = field.kind === "number" ? field.default : undefined;
        return { ...input, value: typeof value === "number" ? value : (fallback ?? null) };
      }
      case "select":
        return { ...input, value: input.options.find((option) => option === value) ?? null };
      default:
        return { ...input, value: typeof value === "string" ? value : "" };
    }
  }
}
