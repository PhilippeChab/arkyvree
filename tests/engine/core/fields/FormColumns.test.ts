import { describe, expect, test } from "bun:test";

import { FormColumns, type FormField } from "@/engine/core/fields/index.ts";

/** A column of each input a form takes as a column, as a module describes them. */
const COLUMNS: FormField[] = [
  { help: "", input: "ref", key: "abilityId", label: "Ability", references: "abilities", required: true },
  { help: "", input: "ref", key: "saveId", label: "Save", references: "saves", required: false },
  {
    default: 8,
    help: "",
    input: "choice",
    key: "hd",
    label: "Hit Die",
    multiple: false,
    options: [4, 8],
    required: true,
  },
  { help: "", input: "choice", key: "slot", label: "Slot", multiple: false, options: ["Head", "Feet"] },
  { default: 30, help: "", input: "number", key: "speed", label: "Speed", min: 1 },
  { help: "", input: "decimal", key: "cost", label: "Cost", min: 0 },
  { help: "", input: "text", key: "type", label: "Type", multiple: false, nullable: false },
  { help: "", input: "text", key: "effect", label: "Effect", multiple: false, nullable: true },
  {
    help: "",
    input: "links",
    key: "aptitudeIds",
    label: "Aptitudes",
    required: "At least one aptitude must be selected",
  },
  { help: "", input: "leveledLinks", key: "aptitudes", label: "Lists", max: 9, min: 0 },
];

const ID = "00000000-0000-4000-8000-000000000001";

/** What a form's columns read as, or the refusal's issues: each its key and its message. */
function read(form: object, creating: boolean) {
  const result = FormColumns.schema(COLUMNS, creating).safeParse(form);
  if (result.success) return result.data;
  return result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
}

describe("A form's columns", () => {
  test("on a new entity, fill their defaults, and refuse a required one left out", () => {
    expect(read({ abilityId: ID, aptitudeIds: [ID] }, true)).toEqual({
      abilityId: ID,
      aptitudeIds: [ID],
      hd: 8,
      speed: 30,
      type: "",
    });
    expect(read({}, true)).toEqual([
      "abilityId: Invalid input: expected string, received undefined",
      "aptitudeIds: Invalid input: expected array, received undefined",
    ]);
    expect(read({ abilityId: ID, aptitudeIds: [] }, true)).toEqual([
      "aptitudeIds: At least one aptitude must be selected",
    ]);
  });

  test("on an edit, leave out the ones it doesn't give", () => {
    expect(read({}, false)).toEqual({});
    expect(read({ aptitudeIds: [] }, false)).toEqual({ aptitudeIds: [] });
  });

  test("read an empty select or text as none, where none clears it", () => {
    expect(read({ saveId: "", slot: "", effect: "", type: "" }, false)).toEqual({
      effect: null,
      saveId: null,
      slot: null,
      type: "",
    });
    expect(read({ abilityId: "", hd: null }, false)).toEqual([
      "abilityId: Invalid UUID",
      "hd: Hit Die must be one of: 4, 8",
    ]);
  });

  test("refuse a value their input doesn't take", () => {
    expect(read({ hd: 6, slot: "Hand", speed: 0, cost: -1, aptitudes: [{ id: ID, level: 10 }] }, false)).toEqual([
      "hd: Hit Die must be one of: 4, 8",
      "slot: Slot must be one of: Head, Feet",
      "speed: Too small: expected number to be >=1",
      "cost: Too small: expected number to be >=0",
      "aptitudes.0.level: Too big: expected number to be <=9",
    ]);
  });

  test("that share a key take what any of them takes, required when every one is", () => {
    const shared: FormField[] = [
      { help: "", input: "choice", key: "type", label: "Type", multiple: false, options: ["Ring", "Weapon"] },
      { help: "", input: "choice", key: "type", label: "Type", multiple: false, options: ["Weapon"], required: true },
    ];
    const schema = FormColumns.schema(shared, true);
    expect(schema.parse({ type: "Ring" })).toEqual({ type: "Ring" });
    expect(schema.parse({})).toEqual({});
    expect(schema.safeParse({ type: "Armor" }).error?.issues.map((issue) => issue.message)).toEqual([
      "Type must be one of: Ring, Weapon",
    ]);
  });
});
