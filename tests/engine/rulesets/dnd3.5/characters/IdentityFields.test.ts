import { describe, expect, test } from "bun:test";

import RulesError from "@/engine/core/RulesError.ts";
import IdentityFields from "@/engine/rulesets/dnd3.5/characters/IdentityFields.ts";

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

describe("IdentityFields", () => {
  test("writes each field it's sent as its field's value, an empty height or weight cleared, its description apart", () => {
    expect(
      IdentityFields.plan({
        alignment: "Chaotic Good",
        experience: 300,
        deity: "",
        age: null,
        gender: "Other",
        height: "",
        weight: "70",
        description: "Short",
      }),
    ).toEqual({
      fields: {
        CHARACTER_ALIGNMENT: "Chaotic Good",
        CHARACTER_XP: 300,
        CHARACTER_DEITY: "",
        CHARACTER_AGE: null,
        CHARACTER_GENDER: "Other",
        CHARACTER_HEIGHT: null,
        CHARACTER_WEIGHT: "70",
      },
      own: { description: "Short" },
    });
  });

  test("leaves a select it's sent unset, and a field it isn't sent, as they are", () => {
    expect(IdentityFields.plan({ alignment: null, gender: null, deity: "Moradin" })).toEqual({
      fields: { CHARACTER_DEITY: "Moradin" },
      own: {},
    });
  });

  test("refuses a field it hasn't, its race, or a value its field doesn't take", () => {
    const refused: Record<string, number | string>[] = [
      { race: "Elf" },
      { nonsense: 1 },
      { gender: "None" },
      { age: 1.5 },
      { experience: "1" },
    ];
    for (const request of refused) expect(() => IdentityFields.plan(request)).toThrow(RulesError);
  });

  test("describes a partly seen character's race and physical traits alone", () => {
    const block = IdentityFields.describe(IDENTITY, true);
    expect(block.lines.map((line) => line.map(({ key }) => key))).toEqual([
      ["race"],
      ["age", "gender", "height", "weight"],
    ]);
    expect(block).toMatchObject({ fields: [] });
    expect(block).not.toHaveProperty("notes");
    expect(block).not.toHaveProperty("languages");
  });

  test("reads a value its options don't hold as unset, and its private notes as its identity holds them", () => {
    const block = IdentityFields.describe({ ...IDENTITY, beliefs: { alignment: "Weird", deity: "" } });
    expect(block.lines[0][1]).toMatchObject({ key: "alignment", value: null });
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
