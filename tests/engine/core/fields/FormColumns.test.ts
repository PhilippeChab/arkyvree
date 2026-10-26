import { describe, expect, test } from "bun:test";

import { Decimals, FormColumns, type FormField } from "@/engine/core/fields/index.ts";

/** A column of each input a form takes as a column, as a module describes them. */
const COLUMNS: FormField[] = [
  { help: "", input: "ref", key: "statId", label: "Stat", references: "stats", required: true, role: "stat" },
  { help: "", input: "ref", key: "traitId", label: "Trait", references: "traits", required: false, role: "trait" },
  {
    default: 8,
    help: "",
    input: "choice",
    key: "die",
    label: "Die",
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
    key: "poolIds",
    label: "Pools",
    references: "pools",
    required: "At least one pool must be selected",
  },
  { help: "", input: "leveledLinks", key: "pools", label: "Lists", max: 9, min: 0, references: "pools" },
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
    expect(read({ statId: ID, poolIds: [ID] }, true)).toEqual({
      statId: ID,
      poolIds: [ID],
      die: 8,
      speed: 30,
      type: "",
    });
    expect(read({}, true)).toEqual([
      "statId: Invalid input: expected string, received undefined",
      "poolIds: Invalid input: expected array, received undefined",
    ]);
    expect(read({ statId: ID, poolIds: [] }, true)).toEqual(["poolIds: At least one pool must be selected"]);
  });

  test("on an edit, leave out the ones it doesn't give", () => {
    expect(read({}, false)).toEqual({});
    expect(read({ poolIds: [] }, false)).toEqual({ poolIds: [] });
  });

  test("round a decimal to its two places, half away from zero, as its text reads", () => {
    expect(read({ cost: 1.239 }, false)).toEqual({ cost: 1.24 });
    expect(read({ cost: 0.125 }, false)).toEqual({ cost: 0.13 });
    expect(read({ cost: 1.005 }, false)).toEqual({ cost: 1.01 });
    expect(read({ cost: 15 }, false)).toEqual({ cost: 15 });
    // One JavaScript writes in exponent form: below 1e-6
    expect(read({ cost: 0.0000001 }, false)).toEqual({ cost: 0 });
    expect(read({ cost: 0.000005 }, false)).toEqual({ cost: 0 });
  });

  test("refuse a number or a decimal past what it holds exactly, its value times ten to its places a safe integer", () => {
    expect(read({ cost: Decimals.largest(2), speed: Number.MAX_SAFE_INTEGER }, false)).toEqual({
      cost: Decimals.largest(2),
      speed: Number.MAX_SAFE_INTEGER,
    });
    expect(read({ cost: 1e21, speed: Number.MAX_SAFE_INTEGER + 1 }, false)).toEqual([
      `speed: Too big: expected int to be <=${Number.MAX_SAFE_INTEGER}`,
      `cost: Too big: expected number to be <=${Decimals.largest(2)}`,
    ]);
    expect(read({ cost: Number("12345678901234567.89") }, false)).toHaveLength(1);
  });

  test("read an empty select or text as none, where none clears it", () => {
    expect(read({ traitId: "", slot: "", effect: "", type: "" }, false)).toEqual({
      effect: null,
      traitId: null,
      slot: null,
      type: "",
    });
    expect(read({ statId: "", die: null }, false)).toEqual(["statId: Invalid UUID", "die: Die must be one of: 4, 8"]);
  });

  test("refuse a value their input doesn't take", () => {
    expect(read({ die: 6, slot: "Hand", speed: 0, cost: -1, pools: [{ id: ID, level: 10 }] }, false)).toEqual([
      "die: Die must be one of: 4, 8",
      "slot: Slot must be one of: Head, Feet",
      "speed: Too small: expected number to be >=1",
      "cost: Too small: expected number to be >=0",
      "pools.0.level: Too big: expected number to be <=9",
    ]);
  });

  test("that share a key take what any of them takes, required when every one is", () => {
    const shared: FormField[] = [
      { help: "", input: "choice", key: "type", label: "Type", multiple: false, options: ["Ring", "Tool"] },
      { help: "", input: "choice", key: "type", label: "Type", multiple: false, options: ["Tool"], required: true },
    ];
    const schema = FormColumns.schema(shared, true);
    expect(schema.parse({ type: "Ring" })).toEqual({ type: "Ring" });
    expect(schema.parse({})).toEqual({});
    expect(schema.safeParse({ type: "Charm" }).error?.issues.map((issue) => issue.message)).toEqual([
      "Type must be one of: Ring, Tool",
    ]);
  });
});
