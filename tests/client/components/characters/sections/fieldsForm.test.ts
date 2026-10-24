import { describe, expect, test } from "bun:test";

import { sentFieldsOf, toFieldsForm } from "@/client/src/components/characters/sections/fieldsForm.ts";
import type { BlockOf } from "@/client/src/components/characters/sections/sheetBlocks.ts";

/** A fields block: a fixed origin, a required experience, a clearable age, a gender select, a description. */
const BLOCK: BlockOf<"fields"> = {
  kind: "fields",
  key: "identity",
  title: "Personal Details",
  empty: "",
  saved: "Character updated",
  failed: "Failed to save character details",
  lines: [
    [
      { key: "origin", kind: "text", label: "Origin", value: "Elf", fixed: true },
      { key: "experience", kind: "number", label: "Experience Points", min: 0, required: "Required", value: 1200 },
    ],
    [
      { key: "age", kind: "number", label: "Age", min: 1, value: null },
      { key: "gender", kind: "select", label: "Gender", options: ["Male", "Female"], value: "Female" },
    ],
  ],
  fields: [{ key: "description", kind: "textarea", label: "Description", placeholder: "", value: "Tall" }],
  links: [{ label: "Tongues", link: "tongues", none: "None", picked: [{ id: "common", name: "Common" }] }],
  notes: { notes: "Public" },
};

describe("A fields block's form", () => {
  test("holds each field's value, an empty number NaN, and empty before the character's are in", () => {
    expect(toFieldsForm(BLOCK, true)).toEqual({
      origin: "Elf",
      experience: 1200,
      age: Number.NaN,
      gender: "Female",
      description: "Tall",
      notes: "Public",
      privateNotes: "",
      links: { tongues: ["common"] },
    });
    expect(toFieldsForm(BLOCK, false)).toMatchObject({ origin: "", experience: 0, age: Number.NaN, gender: "" });
  });

  test("sends each field but a fixed one, an empty number or an unset select as none, and no private notes it lacks", () => {
    const form = { ...toFieldsForm(BLOCK, true), age: Number.NaN, gender: "", privateNotes: "Leaked?" };
    expect(sentFieldsOf(BLOCK, form)).toEqual({
      fields: { experience: 1200, age: null, gender: null, description: "Tall" },
      notes: "Public",
      privateNotes: undefined,
      links: { tongues: ["common"] },
    });
    const noted = { ...BLOCK, notes: { notes: "Public", privateNotes: "" }, links: undefined };
    expect(sentFieldsOf(noted, form)).toMatchObject({ privateNotes: "Leaked?", links: undefined });
    // A block without notes leaves them, and its private ones, as they are
    expect(sentFieldsOf({ ...BLOCK, notes: undefined }, form)).toMatchObject({
      notes: undefined,
      privateNotes: undefined,
    });
  });
});
