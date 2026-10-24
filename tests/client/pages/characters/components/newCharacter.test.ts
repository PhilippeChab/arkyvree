import { describe, expect, test } from "bun:test";

import {
  type CharacterForm,
  creationFieldsOf,
  creationPicksOf,
  emptyNewCharacter,
  narrowingKeysOf,
  narrowingOf,
  scoredLinksOf,
  sentCreationFieldsOf,
} from "@/client/src/pages/characters/components/newCharacter.ts";

/** A form of every kind of field: a required number with its start, an optional one, a select, a text, a textarea. */
const FORM: CharacterForm = {
  sections: [
    {
      kind: "fields",
      title: "Basic Information",
      lines: [
        [
          { kind: "name", label: "Character Name" },
          { key: "xp", kind: "number", label: "Experience Points", min: 0, required: "Required", start: 0 },
        ],
        [
          { kind: "ruleset" },
          { column: "raceId", kind: "pick", label: "Race", required: "Race is required", ineligible: "Not open" },
        ],
        [{ key: "alignment", kind: "select", label: "Alignment", narrows: true, options: ["Lawful Good"] }],
      ],
    },
    { kind: "scores", link: "abilities", title: "Ability Scores", none: "None", pick: "Pick" },
    {
      kind: "fields",
      title: "Details",
      lines: [
        [{ key: "age", kind: "number", label: "Age", min: 1 }],
        [{ key: "deity", kind: "text", label: "Deity" }],
        [{ key: "description", kind: "textarea", label: "Description", placeholder: "…" }],
        [{ kind: "notes" }],
      ],
    },
  ],
};

describe("A new character's form", () => {
  test("lists its rules' fields in its order, not the form's own items", () => {
    expect(creationFieldsOf(FORM).map(({ key }) => key)).toEqual(["xp", "alignment", "age", "deity", "description"]);
  });

  test("starts with nothing picked, each field at its start, else empty: a number NaN", () => {
    const empty = emptyNewCharacter(FORM);
    expect(empty.age).toBeNaN();
    expect(empty).toMatchObject({
      rulesetId: "",
      name: "",
      picks: { raceId: "" },
      scores: { abilities: {} },
      notes: "",
      xp: 0,
      alignment: "",
      deity: "",
      description: "",
    });
  });

  test('narrows its creation picks\' options by the fields that do, "" while unset', () => {
    expect(narrowingKeysOf(FORM)).toEqual(["alignment"]);
    expect(narrowingOf(["alignment"], [""])).toEqual({ alignment: "" });
    expect(narrowingOf(["alignment"], [undefined])).toEqual({ alignment: "" });
    expect(narrowingOf(["alignment"], ["Lawful Good"])).toEqual({ alignment: "Lawful Good" });
  });

  test("lists its creation picks and its scored links in its order", () => {
    expect(creationPicksOf(FORM).map(({ column }) => column)).toEqual(["raceId"]);
    expect(scoredLinksOf(FORM)).toEqual(["abilities"]);
  });

  test("sends its fields by their keys, an empty number or an unset select as none", () => {
    expect(sentCreationFieldsOf(FORM, emptyNewCharacter(FORM))).toEqual({
      xp: 0,
      alignment: null,
      age: null,
      deity: "",
      description: "",
    });
    expect(
      sentCreationFieldsOf(FORM, { xp: 300, alignment: "Lawful Good", age: 30, deity: "Pelor", description: "Tall" }),
    ).toEqual({ xp: 300, alignment: "Lawful Good", age: 30, deity: "Pelor", description: "Tall" });
  });
});
