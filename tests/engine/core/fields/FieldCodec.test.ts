import { describe, expect, test } from "bun:test";

import { FieldCodec, type FormContext, OwnerValues } from "@/engine/core/fields/index.ts";
import type { FieldValue } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import { storedValues } from "@/tests/support/storedValues.ts";

/**
 * Fields of every kind, as a vocabulary declares them: their labels, the closed lists, a reference to an item, a
 * field on another's condition and a group on a column's, declared among the others (a form shows it last).
 */
const FIELDS = {
  title: { description: "Its title", kind: "text", label: "Title", placeholder: 'e.g., "A"', field: "TITLE" },
  school: {
    description: "Its school",
    kind: "text",
    label: "School",
    field: "SCHOOL",
    values: ["Evocation", "Illusion"],
  },
  flag: { description: "Whether it's on", kind: "flag", label: "Flag", field: "FLAG" },
  group: {
    fields: {
      level: { description: "Its level", kind: "number", label: "Level", field: "LEVEL" },
      known: { absent: null, description: "Whether it's known", kind: "flag", label: "Known", field: "KNOWN" },
    },
    kind: "group",
    label: "Group",
    when: { column: "type", values: ["Tool"] },
  },
  count: {
    default: 1,
    description: "How many",
    kind: "number",
    label: "Count",
    min: 1,
    field: "COUNT",
    when: { field: "flag", values: [true] },
  },
  tags: { description: "Its tags", kind: "list", label: "Tags", field: "TAG", values: ["x", "y"] },
  kind: { description: "Its kind", kind: "choice", label: "Kind", field: "KIND", values: ["Arcane", "Divine"] },
  owner: {
    description: "Who owns it",
    field: "OWNER",
    kind: "ref",
    label: "Owner",
    references: "items",
    role: "owner",
  },
} as const;

const CODEC = new FieldCodec(FIELDS, { storesWhen: (fields) => fields.title !== null });

/** What a form's fields are read with: ids the view resolves by prefixing them. */
const CONTEXT: FormContext = {
  resolve: (_type, id) => {
    if (id === "unknown") throw new RulesError("invalid", `Item ${id} does not belong to this ruleset`);
    return `view-${id}`;
  },
};

/**
 * A progression up to level 10, two at most a level: one every 3 levels and one more at the first without a row.
 */
const PROGRESSION = new FieldCodec({
  grants: {
    default: { every: 3, extra: [{ amount: 1, level: 1 }] },
    description: "What each level grants",
    kind: "progression",
    label: "Grants",
    levels: 10,
    max: 2,
    field: "GRANT",
  },
} as const);

/** Rows of `type=value` pairs, in order: what a save writes. */
function rows(...pairs: [string, string][]) {
  return pairs.map(([type, value]) => ({ type, value }));
}

describe("A field codec", () => {
  test("reads each field's default without its values", () => {
    expect(CODEC.read(OwnerValues.NONE)).toEqual({
      count: 1,
      flag: false,
      group: { known: null, level: null },
      kind: null,
      owner: null,
      school: null,
      tags: [],
      title: null,
    });
    expect(CODEC.read(OwnerValues.NONE)).toEqual(CODEC.defaults);
  });

  test("reads a flag true once a value is, a three-state one false off a false value", () => {
    expect(
      CODEC.read(
        storedValues([
          ["FLAG", false],
          ["FLAG", true],
        ]),
      ).flag,
    ).toBe(true);
    expect(CODEC.read(storedValues([["KNOWN", false]])).group.known).toBe(false);
    expect(
      CODEC.read(
        storedValues([
          ["KNOWN", false],
          ["KNOWN", true],
        ]),
      ).group.known,
    ).toBe(true);
  });

  test("reads a number off the first value that's one in its bounds (as text too), and its default otherwise", () => {
    // The flag its condition reads keeps the count, which counts only while it's on
    const counted = (...counts: FieldValue[]) =>
      storedValues([["FLAG", true], ...counts.map((count): [string, FieldValue] => ["COUNT", count])]);
    expect(CODEC.read(counted("x", 0, 3, 4)).count).toBe(3);
    expect(CODEC.read(counted(0)).count).toBe(1);
    expect(
      CODEC.read(
        storedValues([
          ["LEVEL", ""],
          ["LEVEL", -2],
        ]),
      ).group.level,
    ).toBe(-2);
    expect(
      CODEC.read(
        storedValues([
          ["LEVEL", true],
          ["LEVEL", "7"],
        ]),
      ).group.level,
    ).toBe(7);
  });

  test("reads a text off its first value and a reference off its link, a choice only among its values, a list whole", () => {
    const read = CODEC.read(
      storedValues(
        [
          ["TITLE", "A"],
          ["TITLE", "B"],
          ["KIND", "Psionic"],
          ["TAG", "x"],
          ["TAG", "y"],
        ],
        { owner: "id-1" },
      ),
    );
    expect([read.title, read.owner, read.kind, read.tags]).toEqual(["A", "id-1", null, ["x", "y"]]);
    expect(CODEC.read(storedValues([["KIND", "Divine"]])).kind).toBe("Divine");
    // A stored value outside its field's closed list still reads
    expect(CODEC.read(storedValues([["SCHOOL", "Sorcery"]])).school).toBe("Sorcery");
    // A reference's field holds none: its link does
    expect(CODEC.read(storedValues([["OWNER", "id-1"]])).owner).toBeNull();
  });

  test("keeps what a save writes as the stored values it reads: each field's in order, a reference's as its link", () => {
    const written = CODEC.storedOf(rows(["TITLE", "A"], ["TAG", "y"], ["OWNER", "id-1"], ["TAG", "x"], ["NOPE", "z"]));
    expect(written).toEqual({ fields: { TITLE: ["A"], TAG: ["y", "x"] }, links: { owner: "id-1" } });
    expect(CODEC.read(written)).toMatchObject({ owner: "id-1", tags: ["y", "x"], title: "A" });
  });

  test("writes a field with a value, none for a default number, an empty text or a false two-state flag", () => {
    const values = { ...CODEC.defaults, flag: false, group: { known: false, level: 2 }, tags: ["x"], title: "A" };
    expect(CODEC.toProperties(values)).toEqual([
      { type: "TITLE", value: "A" },
      { type: "LEVEL", value: "2" },
      { type: "KNOWN", value: "false" },
      { type: "TAG", value: "x" },
    ]);
    expect(CODEC.toProperties({ ...values, title: "" }).map((row) => row.type)).not.toContain("TITLE");
  });

  test("writes nothing when the entity keeps no field, and a save's write replaces every type", () => {
    expect(CODEC.toProperties({ ...CODEC.defaults, count: 5 })).toEqual([]);
    expect(CODEC.write({ ...CODEC.defaults, title: "A" })).toEqual({
      types: ["TITLE", "SCHOOL", "FLAG", "LEVEL", "KNOWN", "COUNT", "TAG", "KIND", "OWNER"],
      values: [{ type: "TITLE", value: "A" }],
    });
  });

  test("reads and writes a field on its condition, and merges an edit's given fields over the kept", () => {
    expect(CODEC.read(storedValues([["COUNT", 3]])).count).toBe(1);
    expect(CODEC.toProperties({ ...CODEC.defaults, count: 3, title: "A" })).toEqual([{ type: "TITLE", value: "A" }]);
    expect(CODEC.toProperties({ ...CODEC.defaults, count: 3, flag: true, title: "A" })).toEqual([
      { type: "TITLE", value: "A" },
      { type: "FLAG", value: "true" },
      { type: "COUNT", value: "3" },
    ]);
    expect(CODEC.merge({ ...CODEC.defaults, title: "A" }, { count: 2, title: undefined })).toMatchObject({
      count: 2,
      title: "A",
    });
  });

  test("writes what another's values don't hold: an item's over its template's", () => {
    const template = { ...CODEC.defaults, tags: ["y", "x"], title: "A" };
    expect(CODEC.toOverrides({ ...template, tags: ["x", "y"] }, template)).toEqual([]);
    expect(CODEC.toOverrides({ ...template, group: { known: false, level: null }, title: "B" }, template)).toEqual([
      { type: "TITLE", value: "B" },
      { type: "KNOWN", value: "false" },
    ]);
  });

  test("reads a form's fields with each field's shape, those it gives, refusing one past its bounds or values", () => {
    const parse = (given: unknown, kept?: Record<string, unknown>) => CODEC.parse(given, { ...CONTEXT, kept });
    expect(parse(undefined)).toEqual({});
    expect(parse({ tags: ["x"], title: "", school: "Illusion", group: { known: null, level: 2 } })).toEqual({
      group: { known: null, level: 2 },
      school: "Illusion",
      tags: ["x"],
      title: "",
    });
    for (const invalid of [{ flag: true, count: 0 }, { flag: true, count: 2.5 }, { kind: "Psionic" }, { tags: ["z"] }])
      expect(() => parse(invalid)).toThrow(RulesError);
    expect(() => parse({ school: "Sorcery" })).toThrow(RulesError);
  });

  test("refuses a value outside its type's values the entity keeps, a key that's no field", () => {
    const kept = { ...CODEC.defaults, school: "Sorcery", tags: ["z"] };
    expect(() => CODEC.parse({ school: "Sorcery" }, { ...CONTEXT, kept })).toThrow(RulesError);
    expect(() => CODEC.parse({ tags: ["z", "x"] }, { ...CONTEXT, kept })).toThrow(RulesError);
    expect(() => CODEC.parse({ title: "A", unknown: "x" }, CONTEXT)).toThrow(
      expect.objectContaining({ issues: [{ category: "fields.unknown", message: "Not a field of this entity" }] }),
    );
  });

  test("drops a field its condition leaves out, read over what the entity keeps", () => {
    // The count counts only while the flag is on: given with it off, it's dropped, whatever it holds
    expect(CODEC.parse({ count: null, flag: false }, CONTEXT)).toEqual({ flag: false });
    expect(CODEC.parse({ count: 2 }, { ...CONTEXT, kept: { ...CODEC.defaults, flag: true } })).toEqual({ count: 2 });
  });

  test("reads a reference as the id the view keys its entity by, none for an empty one, refused for an unknown one", () => {
    expect(CODEC.parse({ owner: "id-1" }, CONTEXT)).toEqual({ owner: "view-id-1" });
    expect(CODEC.parse({ owner: "" }, CONTEXT)).toEqual({ owner: null });
    expect(() => CODEC.parse({ owner: "unknown" }, CONTEXT)).toThrow(RulesError);
    expect(CODEC.resolveReferences({ ...CODEC.defaults, owner: "id-1" }, (id) => `copy-${id}`).owner).toBe("copy-id-1");
  });

  test("describes its fields as a form shows them, in the order they're declared, groups last", () => {
    const fields = CODEC.describe();
    expect(fields.map((field) => [field.key, field.input])).toEqual([
      ["title", "text"],
      ["school", "choice"],
      ["flag", "flag"],
      ["count", "number"],
      ["tags", "choice"],
      ["kind", "choice"],
      ["owner", "ref"],
      ["group", "group"],
    ]);
    expect(fields[0]).toMatchObject({ label: "Title", help: "Its title", multiple: false, placeholder: 'e.g., "A"' });
    expect(fields[1]).toMatchObject({ multiple: false, options: ["Evocation", "Illusion"] });
    expect(fields[3]).toMatchObject({ default: 1, min: 1, shownWhen: [{ path: "fields.flag", values: [true] }] });
    expect(fields[4]).toMatchObject({ multiple: true, options: ["x", "y"] });
    expect(fields[5]).toMatchObject({ options: ["Arcane", "Divine"] });
    expect(fields[6]).toMatchObject({ references: "items", required: false });
    expect(fields[7]).toMatchObject({
      label: "Group",
      shownWhen: [{ path: "type", values: ["Tool"] }],
      fields: [
        { key: "group.level", input: "number", default: null },
        { key: "group.known", input: "flag", nullable: true },
      ],
    });
  });

  test("shows a field in the groups it names, among their own in declared order, its value its own all the same", () => {
    const codec = new FieldCodec({
      title: FIELDS.title,
      kind: { ...FIELDS.kind, shownIn: ["first", "second"] },
      first: { fields: { level: FIELDS.group.fields.level }, kind: "group", label: "First" },
      second: { fields: { known: FIELDS.group.fields.known }, kind: "group", label: "Second" },
    } as const);
    const fields = codec.describe();
    // Not on its own: in each group, keyed where its value goes
    expect(fields.map((field) => field.key)).toEqual(["title", "first", "second"]);
    const keysIn = (field: (typeof fields)[number]) =>
      field.input === "group" ? field.fields.map((inner) => inner.key) : [];
    expect(keysIn(fields[1]!)).toEqual(["kind", "first.level"]);
    expect(keysIn(fields[2]!)).toEqual(["kind", "second.known"]);

    expect(
      codec.read(
        storedValues([
          ["KIND", "Divine"],
          ["LEVEL", 2],
        ]),
      ),
    ).toMatchObject({ first: { level: 2 }, kind: "Divine" });
    expect(codec.parse({ kind: "Arcane" }, CONTEXT)).toEqual({ kind: "Arcane" });
  });
});

describe("A progression", () => {
  test("reads its frequency and each level's first more in its bounds, at most its bound; its default without a value", () => {
    expect(PROGRESSION.defaults).toEqual({ grants: { every: 3, extra: [{ amount: 1, level: 1 }] } });
    expect(PROGRESSION.read(OwnerValues.NONE)).toEqual(PROGRESSION.defaults);
    const held = storedValues([
      ["GRANT", "5:1"],
      ["GRANT", "every:4"],
      ["GRANT", "2:1"],
      ["GRANT", "2:2"],
      ["GRANT", "3:5"],
      ["GRANT", "11:1"],
      ["GRANT", "4:0"],
      ["GRANT", "every:x"],
    ]);
    expect(PROGRESSION.read(held)).toEqual({
      grants: {
        every: 4,
        extra: [
          { amount: 1, level: 2 },
          { amount: 2, level: 3 },
          { amount: 1, level: 5 },
        ],
      },
    });
    // A level gives at most its bound with its frequency's: what's past it reads as its bound
    expect(
      PROGRESSION.read(
        storedValues([
          ["GRANT", "every:4"],
          ["GRANT", "4:5"],
          ["GRANT", "6:5"],
        ]),
      ),
    ).toEqual({
      grants: {
        every: 4,
        extra: [
          { amount: 1, level: 4 },
          { amount: 2, level: 6 },
        ],
      },
    });
    // A frequency's value alone: none more; without a frequency in its bounds, its default
    expect(PROGRESSION.read(storedValues([["GRANT", "every:0"]]))).toEqual({ grants: { every: 0, extra: [] } });
    for (const values of [
      storedValues([
        ["GRANT", "every:11"],
        ["GRANT", "5:1"],
      ]),
      storedValues([["GRANT", "6:1"]]),
    ])
      expect(PROGRESSION.read(values)).toEqual(PROGRESSION.defaults);
  });

  test("writes its frequency's row and one per level it gives more at, which read back", () => {
    const grants = { every: 0, extra: [{ amount: 2, level: 4 }] };
    expect(PROGRESSION.toProperties({ grants })).toEqual(rows(["GRANT", "every:0"], ["GRANT", "4:2"]));
    expect(PROGRESSION.read(PROGRESSION.storedOf(PROGRESSION.toProperties({ grants })))).toEqual({ grants });
    expect(PROGRESSION.toProperties({ grants: { every: 5, extra: [] } })).toEqual(rows(["GRANT", "every:5"]));
  });

  test("reads a form's progression sorted by level, refusing a level listed twice or giving past its bound", () => {
    const parse = (grants: unknown) => PROGRESSION.parse({ grants }, CONTEXT);
    const given = (...extra: [number, number][]) => extra.map(([level, amount]) => ({ amount, level }));
    expect(parse({ every: 2, extra: given([5, 2], [2, 1]) })).toEqual({
      grants: { every: 2, extra: given([2, 1], [5, 2]) },
    });
    const refused = [
      { every: 3, extra: given([2, 1], [2, 1]) },
      { every: 3, extra: given([3, 2]) },
      { every: 3, extra: given([11, 1]) },
      { every: 3, extra: given([2, 0]) },
      { every: 11, extra: [] },
      { every: -1, extra: [] },
      { every: 3 },
      { every: 3, extra: [], more: 1 },
      [1, 0, 1],
    ];
    for (const grants of refused) expect(() => parse(grants)).toThrow(RulesError);
    expect(() => parse({ every: 3, extra: given([3, 2]) })).toThrow(
      expect.objectContaining({ issues: [expect.objectContaining({ category: "fields.grants.extra.0.amount" })] }),
    );
  });

  test("describes its default and its bounds", () => {
    expect(PROGRESSION.describe()).toEqual([
      {
        default: { every: 3, extra: [{ amount: 1, level: 1 }] },
        help: "What each level grants",
        input: "progression",
        key: "grants",
        label: "Grants",
        levels: 10,
        max: 2,
      },
    ]);
  });
});
