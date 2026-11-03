import { describe, expect, test } from "bun:test";

import { FieldInputs } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";

/**
 * A character's own fields, as a module declares them: a select its forms never leave at none, one they may, a number
 * with a default, one without, and a text with an example.
 */
const FIELDS = {
  mood: {
    default: "Calm",
    description: "Its mood",
    kind: "text",
    label: "Mood",
    required: true,
    field: "MOOD",
    merge: "winner",
    values: ["Calm", "Grim"],
    write: "always",
  },
  tone: { description: "Its tone", kind: "choice", label: "Tone", field: "TONE", merge: "winner", values: ["Low"] },
  tally: {
    default: 0,
    description: "Its tally",
    kind: "number",
    label: "Tally",
    min: 0,
    field: "TALLY",
    merge: "winner",
    write: "always",
  },
  span: { description: "Its span", kind: "number", label: "Span", min: 1, field: "SPAN", merge: "winner" },
  motto: {
    description: "Its motto",
    kind: "text",
    label: "Motto",
    placeholder: "e.g., Onward",
    field: "MOTTO",
    merge: "winner",
  },
} as const;

/** A codec's refusal of a field (`field`), as `parse` throws it. */
function refuse(field: string): never {
  throw new RulesError("invalid", "Request validation failed", [{ category: `fields.${field}`, message: "Bad" }]);
}

describe("FieldInputs", () => {
  test("describes a field's input alike on a sheet and on a new character's form, required as its forms read it", () => {
    const fields = Object.values(FIELDS);
    const created = fields.map((field) => FieldInputs.creationFieldOf(field));
    const held = fields.map((field) => FieldInputs.sheetFieldOf(field, undefined));
    expect(created).toEqual([
      { key: "MOOD", kind: "select", label: "Mood", options: ["Calm", "Grim"], required: "Mood is required" },
      { key: "TONE", kind: "select", label: "Tone", options: ["Low"] },
      { key: "TALLY", kind: "number", label: "Tally", min: 0, required: "Tally is required", start: 0 },
      { key: "SPAN", kind: "number", label: "Span", min: 1 },
      { key: "MOTTO", kind: "text", label: "Motto", placeholder: "e.g., Onward" },
    ]);
    // The sheet's input is the form's, holding a value where the form starts
    expect(held.map(({ value: _value, ...input }) => input)).toEqual(
      created.map((field) => {
        if (field.kind !== "number") return field;
        const { start: _start, ...input } = field;
        return input;
      }),
    );
  });

  test("adds what a new character's form shows of its own: a select that narrows its picks, a stepped number", () => {
    expect(FieldInputs.creationFieldOf(FIELDS.mood, { narrows: true })).toMatchObject({ narrows: true });
    expect(FieldInputs.creationFieldOf(FIELDS.span, { stepped: true })).toMatchObject({ stepped: true });
  });

  test("holds a field's value on a sheet: a number's default without one, none for a value off a select's options", () => {
    const values = (field: (typeof FIELDS)[keyof typeof FIELDS], ...held: unknown[]) =>
      held.map((value) => FieldInputs.sheetFieldOf(field, value).value);
    expect(values(FIELDS.tally, 3, undefined, "3")).toEqual([3, 0, 0]);
    expect(values(FIELDS.span, 3, undefined)).toEqual([3, null]);
    expect(values(FIELDS.mood, "Grim", "Wild", null)).toEqual(["Grim", null, null]);
    expect(values(FIELDS.motto, "Up", undefined)).toEqual(["Up", ""]);
  });

  test("refuses a new character that leaves out a field its forms never leave at none, with what its codec refuses", () => {
    const parse = (given: Record<string, unknown>) => given;
    expect(FieldInputs.parseNew(FIELDS, { MOOD: "Calm", TALLY: 0 }, parse)).toEqual({ MOOD: "Calm", TALLY: 0 });
    expect(() => FieldInputs.parseNew(FIELDS, { TONE: null }, parse)).toThrow(
      expect.objectContaining({
        refusal: "invalid",
        issues: [
          { category: "fields.MOOD", message: "Mood is required" },
          { category: "fields.TALLY", message: "Tally is required" },
        ],
      }),
    );
    expect(() => FieldInputs.parseNew(FIELDS, { MOOD: "Calm" }, () => refuse("SPAN"))).toThrow(
      expect.objectContaining({
        issues: [
          { category: "fields.TALLY", message: "Tally is required" },
          { category: "fields.SPAN", message: "Bad" },
        ],
      }),
    );
    expect(() => FieldInputs.parseNew(FIELDS, { MOOD: "Calm", TALLY: 0 }, () => refuse("SPAN"))).toThrow(
      expect.objectContaining({ issues: [{ category: "fields.SPAN", message: "Bad" }] }),
    );
  });

  test("never requires a field its forms show no input of: a flag", () => {
    const flagged = {
      ...FIELDS,
      marked: { description: "Whether it's marked", kind: "flag", label: "Marked", field: "MARKED", merge: "winner" },
    } as const;
    const parse = (given: Record<string, unknown>) => given;
    expect(FieldInputs.parseNew(flagged, { MOOD: "Calm", TALLY: 0 }, parse)).toEqual({ MOOD: "Calm", TALLY: 0 });
    expect(FieldInputs.sentOf(flagged, { MARKED: null })).toEqual({ MARKED: null });
  });

  test("sends an edit's fields but a select its forms never leave at none, sent unset", () => {
    expect(FieldInputs.sentOf(FIELDS, { MOOD: null, TONE: null, TALLY: null, SPAN: null, MOTTO: "" })).toEqual({
      TONE: null,
      TALLY: null,
      SPAN: null,
      MOTTO: "",
    });
    expect(FieldInputs.sentOf(FIELDS, { MOOD: "Grim" })).toEqual({ MOOD: "Grim" });
  });
});
