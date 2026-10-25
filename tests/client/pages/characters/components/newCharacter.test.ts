import { describe, expect, test } from "bun:test";

import {
  type CharacterForm,
  creationFieldsOf,
  creationPicksOf,
  emptyNewCharacter,
  narrowingKeysOf,
  narrowingOf,
  scoredRolesOf,
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
          { key: "renown", kind: "number", label: "Renown", min: 0, required: "Required", start: 0 },
        ],
        [
          { kind: "ruleset" },
          { role: "origin", kind: "pick", label: "Origin", required: "Origin is required", ineligible: "Not open" },
        ],
        [{ key: "outlook", kind: "select", label: "Outlook", narrows: true, options: ["Steadfast"] }],
      ],
    },
    { kind: "scores", role: "stat", title: "Stat Scores", none: "None", pick: "Pick" },
    {
      kind: "fields",
      title: "Details",
      lines: [
        [{ key: "age", kind: "number", label: "Age", min: 1 }],
        [{ key: "patron", kind: "text", label: "Patron" }],
        [{ key: "description", kind: "textarea", label: "Description", placeholder: "…" }],
        [{ kind: "notes" }],
      ],
    },
  ],
};

describe("A new character's form", () => {
  test("lists its rules' fields in its order, not the form's own items", () => {
    expect(creationFieldsOf(FORM).map(({ key }) => key)).toEqual(["renown", "outlook", "age", "patron", "description"]);
  });

  test("starts with nothing picked, each field at its start, else empty: a number NaN", () => {
    const empty = emptyNewCharacter(FORM);
    expect(empty.age).toBeNaN();
    expect(empty).toMatchObject({
      rulesetId: "",
      name: "",
      picks: { origin: "" },
      scores: { stat: {} },
      notes: "",
      renown: 0,
      outlook: "",
      patron: "",
      description: "",
    });
  });

  test('narrows its creation picks\' options by the fields that do, "" while unset', () => {
    expect(narrowingKeysOf(FORM)).toEqual(["outlook"]);
    expect(narrowingOf(["outlook"], [""])).toEqual({ outlook: "" });
    expect(narrowingOf(["outlook"], [undefined])).toEqual({ outlook: "" });
    expect(narrowingOf(["outlook"], ["Steadfast"])).toEqual({ outlook: "Steadfast" });
  });

  test("lists its creation picks and its scored links in its order", () => {
    expect(creationPicksOf(FORM).map(({ role }) => role)).toEqual(["origin"]);
    expect(scoredRolesOf(FORM)).toEqual(["stat"]);
  });

  test("sends its fields by their keys, an empty number or an unset select as none", () => {
    expect(sentCreationFieldsOf(FORM, emptyNewCharacter(FORM))).toEqual({
      renown: 0,
      outlook: null,
      age: null,
      patron: "",
      description: "",
    });
    expect(
      sentCreationFieldsOf(FORM, { renown: 300, outlook: "Steadfast", age: 30, patron: "Aurel", description: "Tall" }),
    ).toEqual({ renown: 300, outlook: "Steadfast", age: 30, patron: "Aurel", description: "Tall" });
  });
});
