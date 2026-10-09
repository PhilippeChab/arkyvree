import { describe, expect, test } from "bun:test";

import { Field, FieldCodec } from "@/engine/core/fields/index.ts";

const CODEC = new FieldCodec(
  {
    count: Field.number("COUNT", { default: 1, min: 1 }),
    flag: Field.flag("FLAG"),
    group: Field.group({ known: Field.flag("KNOWN", { absent: null }), level: Field.number("LEVEL") }),
    kind: Field.choice("KIND", ["Arcane", "Divine"] as const),
    owner: Field.ref("OWNER"),
    tags: Field.list("TAG"),
    title: Field.text("TITLE"),
  },
  {
    normalize: (fields) => ({ ...fields, count: fields.flag ? fields.count : 1 }),
    storesWhen: (fields) => fields.title !== null,
  },
);

/** Rows of `type=value` pairs, in order. */
function rows(...pairs: [string, string][]) {
  return pairs.map(([type, value]) => ({ type, value }));
}

describe("A field codec", () => {
  test("reads each field's default without its rows", () => {
    expect(CODEC.read([])).toEqual({
      count: 1,
      flag: false,
      group: { known: null, level: null },
      kind: null,
      owner: null,
      tags: [],
      title: null,
    });
    expect(CODEC.read([])).toEqual(CODEC.defaults);
  });

  test("reads a flag true once a row says so, a three-state one false off a false row", () => {
    expect(CODEC.read(rows(["FLAG", "false"], ["FLAG", "true"])).flag).toBe(true);
    expect(CODEC.read(rows(["KNOWN", "false"])).group.known).toBe(false);
    expect(CODEC.read(rows(["KNOWN", "false"], ["KNOWN", "true"])).group.known).toBe(true);
  });

  test("reads a number off the first row holding one in its bounds, and its default otherwise", () => {
    expect(CODEC.read(rows(["COUNT", "x"], ["COUNT", "0"], ["COUNT", "3"], ["COUNT", "4"])).count).toBe(3);
    expect(CODEC.read(rows(["COUNT", "0"])).count).toBe(1);
    expect(CODEC.read(rows(["LEVEL", ""], ["LEVEL", "-2"])).group.level).toBe(-2);
  });

  test("reads a text and a reference off their first row, a choice only among its values, a list whole", () => {
    const read = CODEC.read(
      rows(["TITLE", "A"], ["TITLE", "B"], ["OWNER", "id-1"], ["KIND", "Psionic"], ["TAG", "x"], ["TAG", "y"]),
    );
    expect([read.title, read.owner, read.kind, read.tags]).toEqual(["A", "id-1", null, ["x", "y"]]);
    expect(CODEC.read(rows(["KIND", "Divine"])).kind).toBe("Divine");
  });

  test("writes a field with a value, none for a default number, an empty text or a false two-state flag", () => {
    const values = { ...CODEC.defaults, flag: false, group: { known: false, level: 2 }, tags: ["x"], title: "A" };
    expect(CODEC.toProperties(values)).toEqual([
      { type: "KNOWN", value: "false" },
      { type: "LEVEL", value: "2" },
      { type: "TAG", value: "x" },
      { type: "TITLE", value: "A" },
    ]);
    expect(CODEC.toProperties({ ...values, title: "" }).map((row) => row.type)).not.toContain("TITLE");
  });

  test("writes nothing when the entity keeps no field, and a save's write replaces every type", () => {
    expect(CODEC.toProperties({ ...CODEC.defaults, count: 5 })).toEqual([]);
    expect(CODEC.write({ title: "A" })).toEqual({
      types: ["COUNT", "FLAG", "KNOWN", "LEVEL", "KIND", "OWNER", "TAG", "TITLE"],
      values: [{ type: "TITLE", value: "A" }],
    });
  });

  test("normalizes, merges an edit's given fields over the kept, and finds each field's row", () => {
    expect(CODEC.normalize({ ...CODEC.defaults, count: 3 }).count).toBe(1);
    expect(CODEC.merge({ ...CODEC.defaults, title: "A" }, { count: 2, title: undefined })).toMatchObject({
      count: 2,
      title: "A",
    });
    expect(CODEC.readIds([{ id: "r1", type: "TITLE", value: "A" }])).toMatchObject({ owner: null, title: "r1" });
  });

  test("validates a body's fields with each field's shape, optional for an edit", () => {
    const shape = CODEC.shape();
    expect(shape.count.safeParse(0).success).toBe(false);
    expect(shape.count.safeParse(2.5).success).toBe(false);
    expect(shape.kind.safeParse("Psionic").success).toBe(false);
    expect(shape.tags.safeParse(["x"]).success).toBe(true);
    expect(CODEC.shape({ optional: true }).title.safeParse(undefined).success).toBe(true);
  });
});
