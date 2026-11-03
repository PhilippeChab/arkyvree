import { describe, expect, test } from "bun:test";

import type { FieldsRequest } from "@/engine/core/module/index.ts";
import { Engine } from "@/engine/index.ts";
import IdentityFields from "@/engine/rulesets/dnd3.5/characters/IdentityFields.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { readCharacterInput } from "@/server/services/characters/index.ts";
import type { Character } from "@/shared/relations.ts";
import { createCharacterAs } from "@/tests/support/dnd3.5/characters.ts";
import { makeSession } from "@/tests/support/users.ts";
import {
  CHARACTER_AGE,
  CHARACTER_ALIGNMENT,
  CHARACTER_DEITY,
  CHARACTER_GENDER,
  CHARACTER_HEIGHT,
  CHARACTER_WEIGHT,
  CHARACTER_XP,
} from "@/vocabulary/dnd3.5/fields/index.ts";

/** A character's identity, as its sheet reads it. */
const IDENTITY = {
  background: { notes: "Public", privateNotes: "Secret" },
  beliefs: { alignment: "Lawful Good", deity: "Pelor" },
  meta: { xp: 1200 },
  physiology: {
    age: 30,
    description: "Tall",
    gender: "Female",
    height: "180",
    languages: [{ id: "common", name: "Common" }],
    race: { name: "Elf" },
    weight: "",
  },
};

/** What an edit of a new Lawful Good woman's identity (`fields`, as its sheet sends them) writes, as planned. */
async function planOf(fields: FieldsRequest) {
  const record: Character = await createCharacterAs(makeSession(), {
    fields: { [CHARACTER_ALIGNMENT]: "Lawful Good", [CHARACTER_GENDER]: "Female" },
  });
  return await withRulesetScope(db, record.rulesetId, async (scope) =>
    Engine.for(scope)
      .character(await readCharacterInput(db, record))
      .planEdit({ fields }),
  );
}

describe("IdentityFields", () => {
  test("writes each field it's sent by its stored field, an empty text or a null clearing it, its description apart", async () => {
    expect(
      await planOf({
        [CHARACTER_ALIGNMENT]: "Chaotic Good",
        [CHARACTER_XP]: 300,
        [CHARACTER_DEITY]: "",
        [CHARACTER_AGE]: null,
        [CHARACTER_GENDER]: "Other",
        [CHARACTER_HEIGHT]: "",
        [CHARACTER_WEIGHT]: "70",
        description: "Short",
      }),
    ).toEqual({
      fields: {
        [CHARACTER_ALIGNMENT]: "Chaotic Good",
        [CHARACTER_XP]: 300,
        [CHARACTER_DEITY]: null,
        [CHARACTER_AGE]: null,
        [CHARACTER_GENDER]: "Other",
        [CHARACTER_HEIGHT]: null,
        [CHARACTER_WEIGHT]: "70",
      },
      own: { description: "Short" },
    });
  });

  test("leaves a select it's sent unset, and a field it isn't sent, as they are", async () => {
    expect(
      await planOf({ [CHARACTER_ALIGNMENT]: null, [CHARACTER_GENDER]: null, [CHARACTER_DEITY]: "Moradin" }),
    ).toEqual({ fields: { [CHARACTER_DEITY]: "Moradin" }, own: {} });
  });

  test("refuses a field it hasn't, its race, an old key, or a value its field doesn't take, under its key", async () => {
    const refused: [string, FieldsRequest][] = [
      ["fields.race", { race: "Elf" }],
      ["fields.nonsense", { nonsense: 1 }],
      ["fields.experience", { experience: 300 }],
      [`fields.${CHARACTER_GENDER}`, { [CHARACTER_GENDER]: "None" }],
      [`fields.${CHARACTER_AGE}`, { [CHARACTER_AGE]: 1.5 }],
      [`fields.${CHARACTER_AGE}`, { [CHARACTER_AGE]: 0 }],
      [`fields.${CHARACTER_XP}`, { [CHARACTER_XP]: "1" }],
      [`fields.${CHARACTER_XP}`, { [CHARACTER_XP]: null }],
      [`fields.${CHARACTER_XP}`, { [CHARACTER_XP]: -1 }],
      ["fields.description", { description: 1 }],
    ];
    for (const [category, request] of refused)
      expect(planOf(request)).rejects.toMatchObject({ refusal: "invalid", issues: [{ category }] });
  });

  test("describes a partly seen character's race and physical traits alone, each by its stored field", () => {
    const block = IdentityFields.describe(IDENTITY, true);
    expect(block.lines.map((line) => line.map(({ key }) => key))).toEqual([
      ["race"],
      [CHARACTER_AGE, CHARACTER_GENDER, CHARACTER_HEIGHT, CHARACTER_WEIGHT],
    ]);
    expect(block).toMatchObject({ fields: [] });
    expect(block).not.toHaveProperty("notes");
    expect(block).not.toHaveProperty("languages");
  });

  test("labels and bounds each field as it's declared, as a new character's form does: its alignment, gender and experience required", () => {
    const [[, alignment, xp, deity], [age, gender, height]] = IdentityFields.describe(IDENTITY).lines;
    expect(alignment).toMatchObject({
      key: CHARACTER_ALIGNMENT,
      kind: "select",
      label: "Alignment",
      required: "Alignment is required",
      value: "Lawful Good",
    });
    expect(xp).toEqual({
      key: CHARACTER_XP,
      kind: "number",
      label: "Experience Points",
      min: 0,
      required: "Experience Points is required",
      value: 1200,
    });
    expect(deity).toEqual({ key: CHARACTER_DEITY, kind: "text", label: "Deity", value: "Pelor" });
    expect(age).toEqual({ key: CHARACTER_AGE, kind: "number", label: "Age", min: 1, value: 30 });
    expect(gender).toMatchObject({
      key: CHARACTER_GENDER,
      options: ["Male", "Female", "Other"],
      required: "Gender is required",
      value: "Female",
    });
    expect(height).toEqual({
      key: CHARACTER_HEIGHT,
      kind: "text",
      label: "Height",
      placeholder: "e.g., 5 feet 8 inches",
      value: "180",
    });
  });

  test("reads a value its options don't hold as unset, and its private notes as its identity holds them", () => {
    const block = IdentityFields.describe({ ...IDENTITY, beliefs: { alignment: "Weird", deity: "" } });
    expect(block.lines[0][1]).toMatchObject({ key: CHARACTER_ALIGNMENT, value: null });
    expect(block.notes).toEqual({ notes: "Public", privateNotes: "Secret" });
    expect(block.links).toEqual([
      {
        label: "Languages",
        role: "speaks",
        none: "No language left to pick",
        picked: [{ id: "common", name: "Common" }],
      },
    ]);
  });
});
