import { describe, expect, test } from "bun:test";

import { z } from "zod";

import { Decimals, FormColumns, type FormField } from "@/engine/core/fields/index.ts";

/** A column of each input a form takes as a column, as a module describes them: each at its field or its role. */
const COLUMNS: FormField[] = [
  { help: "", input: "ref", label: "Stat", references: "stats", required: true, role: "stat" },
  { help: "", input: "ref", label: "Trait", references: "traits", required: false, role: "trait" },
  {
    default: 8,
    field: "DIE",
    help: "",
    input: "choice",
    label: "Die",
    multiple: false,
    options: [4, 8],
    required: true,
  },
  { field: "SLOT", help: "", input: "choice", label: "Slot", multiple: false, options: ["Head", "Feet"] },
  { default: 30, field: "SPEED", help: "", input: "number", label: "Speed", min: 1 },
  { field: "COST", help: "", input: "decimal", label: "Cost", min: 0 },
  { field: "TYPE", help: "", input: "text", label: "Type", multiple: false, nullable: false },
  { field: "EFFECT", help: "", input: "text", label: "Effect", multiple: false, nullable: true },
  {
    help: "",
    input: "links",
    label: "Pools",
    references: "pools",
    required: "At least one pool must be selected",
    role: "pool",
  },
  { help: "", input: "leveledLinks", label: "Lists", max: 9, min: 0, references: "pools", role: "listedIn" },
  { help: "", input: "amounts", label: "Bonuses", max: 12, min: 0, references: "stats", role: "bonus" },
  { help: "", input: "grants", label: "Grants", references: "gizmos", role: "grants" },
];

const ID = "00000000-0000-4000-8000-000000000001";

/** What a form's columns read as, or the refusal's issues: each its place and its message. */
function read(form: { fields?: object; links?: object }, creating: boolean) {
  const result = schemaOf(COLUMNS, creating).safeParse({ fields: {}, links: {}, ...form });
  if (result.success) return result.data;
  return result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
}

/** A form's columns' schema (`columns`), where its form sends them: its fields and its links. */
function schemaOf(columns: readonly FormField[], creating: boolean) {
  const shapes = FormColumns.shapes(columns, creating);
  return z.object({ fields: z.object(shapes.fields), links: z.object(shapes.links) });
}

describe("A form's columns", () => {
  test("on a new entity, fill their defaults, and refuse a required one left out", () => {
    expect(read({ links: { stat: ID, pool: [{ toId: ID }] } }, true)).toEqual({
      fields: { DIE: 8, SPEED: 30, TYPE: "" },
      links: { stat: ID, pool: [{ toId: ID }] },
    });
    expect(read({}, true)).toEqual([
      "links.stat: Invalid input: expected string, received undefined",
      "links.pool: Invalid input: expected array, received undefined",
    ]);
    expect(read({ links: { stat: ID, pool: [] } }, true)).toEqual(["links.pool: At least one pool must be selected"]);
  });

  test("on an edit, leave out the ones it doesn't give", () => {
    expect(read({}, false)).toEqual({ fields: {}, links: {} });
    expect(read({ links: { pool: [] } }, false)).toEqual({ fields: {}, links: { pool: [] } });
  });

  test("read a list of links' entries by their links' own columns", () => {
    const links = {
      listedIn: [{ toId: ID, tier: 3 }, { toId: ID }],
      bonus: [{ toId: ID, amount: 2 }],
      grants: [{ toId: ID, viaId: ID, free: false }],
    };
    expect(read({ links }, false)).toEqual({ fields: {}, links });
    expect(read({ links: { bonus: [{ toId: ID, amount: 13 }], grants: [{ toId: ID }] } }, false)).toEqual([
      "links.bonus.0.amount: Too big: expected number to be <=12",
      "links.grants.0.viaId: Invalid input: expected string, received undefined",
    ]);
  });

  test("round a decimal to its two places, half away from zero, as its text reads", () => {
    const cost = (value: number) => read({ fields: { COST: value } }, false);
    expect(cost(1.239)).toEqual({ fields: { COST: 1.24 }, links: {} });
    expect(cost(0.125)).toEqual({ fields: { COST: 0.13 }, links: {} });
    expect(cost(1.005)).toEqual({ fields: { COST: 1.01 }, links: {} });
    expect(cost(15)).toEqual({ fields: { COST: 15 }, links: {} });
    // One JavaScript writes in exponent form: below 1e-6
    expect(cost(0.0000001)).toEqual({ fields: { COST: 0 }, links: {} });
    expect(cost(0.000005)).toEqual({ fields: { COST: 0 }, links: {} });
  });

  test("refuse a number or a decimal past what it holds exactly, its value times ten to its places a safe integer", () => {
    expect(read({ fields: { COST: Decimals.largest(2), SPEED: Number.MAX_SAFE_INTEGER } }, false)).toEqual({
      fields: { COST: Decimals.largest(2), SPEED: Number.MAX_SAFE_INTEGER },
      links: {},
    });
    expect(read({ fields: { COST: 1e21, SPEED: Number.MAX_SAFE_INTEGER + 1 } }, false)).toEqual([
      `fields.SPEED: Too big: expected int to be <=${Number.MAX_SAFE_INTEGER}`,
      `fields.COST: Too big: expected number to be <=${Decimals.largest(2)}`,
    ]);
    expect(read({ fields: { COST: Number("12345678901234567.89") } }, false)).toHaveLength(1);
  });

  test("read an empty select or text as none, where none clears it", () => {
    expect(read({ fields: { SLOT: "", EFFECT: "", TYPE: "" }, links: { trait: "" } }, false)).toEqual({
      fields: { EFFECT: null, SLOT: null, TYPE: "" },
      links: { trait: null },
    });
    expect(read({ fields: { DIE: null }, links: { stat: "" } }, false)).toEqual([
      "fields.DIE: Die must be one of: 4, 8",
      "links.stat: Invalid UUID",
    ]);
  });

  test("refuse a value their input doesn't take", () => {
    expect(
      read(
        {
          fields: { DIE: 6, SLOT: "Hand", SPEED: 0, COST: -1 },
          links: { listedIn: [{ toId: ID, tier: 10 }] },
        },
        false,
      ),
    ).toEqual([
      "fields.DIE: Die must be one of: 4, 8",
      "fields.SLOT: Slot must be one of: Head, Feet",
      "fields.SPEED: Too small: expected number to be >=1",
      "fields.COST: Too small: expected number to be >=0",
      "links.listedIn.0.tier: Too big: expected number to be <=9",
    ]);
  });

  test("that share a stored field take what any of them takes, required when every one is", () => {
    const shared: FormField[] = [
      { field: "TYPE", help: "", input: "choice", label: "Type", multiple: false, options: ["Ring", "Tool"] },
      { field: "TYPE", help: "", input: "choice", label: "Type", multiple: false, options: ["Tool"], required: true },
    ];
    const schema = z.object(FormColumns.shapes(shared, true).fields);
    expect(schema.parse({ TYPE: "Ring" })).toEqual({ TYPE: "Ring" });
    expect(schema.parse({})).toEqual({});
    expect(schema.safeParse({ TYPE: "Charm" }).error?.issues.map((issue) => issue.message)).toEqual([
      "Type must be one of: Ring, Tool",
    ]);
  });
});
