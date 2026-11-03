/** A `fields` block's form: its values as the form holds them, from the block, and as its edit sends them. */

import { requiredRules } from "@/client/src/lib/validation.ts";

import type { BlockOf, SheetField } from "./sheetBlocks.ts";

/**
 * A `fields` block as its form holds it: each field's value by its key (a number's NaN while it's empty, a select's
 * "" while it's unset), each picked link's entities' ids by its role (`links`), and its notes.
 */
export type FieldsFormData = Record<string, number | Record<string, string[]> | string>;

/** A block's fields, wherever it lays them out. */
export function fieldsOf(block: BlockOf<"fields">) {
  return [...block.lines.flat(), ...block.fields];
}

/** A field's value as its form holds it: a number's NaN while it's empty, a select's "" while it's unset. */
export function formValueOf(field: SheetField) {
  if (field.kind === "number") return field.value ?? Number.NaN;
  if (field.kind === "select") return field.value ?? "";
  return field.value;
}

/**
 * What a select checks before its edit is sent: a value, when it's required. One whose value is off its options holds
 * none, so its edit waits for a pick, and sends nothing until then.
 */
export function selectRulesOf(field: Extract<SheetField, { kind: "select" }>) {
  return field.required ? requiredRules(field.required) : undefined;
}

/**
 * A form's values as the block's edit sends them: each field by its key but a fixed one (an empty number or an unset
 * select, none), its notes and its private ones and its picked links, each only where the block holds them.
 */
export function sentFieldsOf(block: BlockOf<"fields">, formData: FieldsFormData) {
  return {
    fields: Object.fromEntries(
      fieldsOf(block)
        .filter((field) => !(field.kind === "text" && field.fixed))
        .map((field) => [field.key, sentValueOf(field, formData[field.key])]),
    ),
    // A block without notes leaves them as they are
    notes: block.notes ? String(formData.notes) : undefined,
    privateNotes: block.notes?.privateNotes !== undefined ? String(formData.privateNotes) : undefined,
    links: block.links ? (formData.links as Record<string, string[]>) : undefined,
  };
}

/** A field's value as its edit sends it: an empty number or an unset select, none. */
export function sentValueOf(field: SheetField, value: FieldsFormData[string]) {
  if (field.kind === "number") return typeof value === "number" && Number.isFinite(value) ? value : null;
  if (field.kind === "select") return typeof value === "string" && value ? value : null;
  return typeof value === "string" ? value : String(value);
}

/**
 * A block's values as its form holds them (`filled`: the character's; else each field empty, as before they're in: a
 * required number at its least, a number NaN, a text and a select "").
 */
export function toFieldsForm(block: BlockOf<"fields">, filled: boolean): FieldsFormData {
  const empty = (field: SheetField) => {
    if (field.kind === "number") return field.required ? field.min : Number.NaN;
    return "";
  };
  return {
    ...Object.fromEntries(fieldsOf(block).map((field) => [field.key, filled ? formValueOf(field) : empty(field)])),
    notes: filled ? (block.notes?.notes ?? "") : "",
    privateNotes: filled ? (block.notes?.privateNotes ?? "") : "",
    links: Object.fromEntries(
      (block.links ?? []).map(({ picked, role }) => [role, filled ? picked.map(({ id }) => id) : []]),
    ),
  };
}
