import { describe, expect, test } from "bun:test";

import { FieldCodec, type FormContext, OwnerValues } from "@/engine/core/fields/index.ts";
import type { FieldValue } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { StandaloneKind } from "@/engine/core/view/index.ts";
import { heldValues, writtenValues } from "@/tests/support/ownerValues.ts";

/** The made-up kind a reference names: one no module declares, typed as the view's registry types a kind. */
const GIZMOS = "gizmos" as string as StandaloneKind;

/**
 * Fields of every kind, as a vocabulary declares them: their labels, the closed lists, a reference to an item, a
 * field on another's condition and a group on a column's, declared among the others (a form shows it last).
 */
const FIELDS = {
  title: {
    description: "Its title",
    // Without a title, the entity keeps none of the fields its form shows
    keepsForm: true,
    kind: "text",
    label: "Title",
    placeholder: 'e.g., "A"',
    field: "TITLE",
    merge: "winner",
  },
  school: {
    description: "Its school",
    kind: "text",
    label: "School",
    field: "SCHOOL",
    merge: "fallback",
    values: ["Evocation", "Illusion"],
  },
  flag: { description: "Whether it's on", kind: "flag", label: "Flag", field: "FLAG", merge: "fallback" },
  group: {
    fields: {
      level: { description: "Its level", kind: "number", label: "Level", field: "LEVEL", merge: "fallback" },
      known: {
        absent: null,
        description: "Whether it's known",
        kind: "flag",
        label: "Known",
        field: "KNOWN",
        merge: "fallback",
      },
    },
    kind: "group",
    label: "Group",
    when: { column: "TYPE", values: ["Tool"] },
  },
  count: {
    default: 1,
    description: "How many",
    kind: "number",
    label: "Count",
    min: 1,
    field: "COUNT",
    merge: "fallback",
    when: { field: "flag", values: [true] },
  },
  tags: { description: "Its tags", kind: "list", label: "Tags", field: "TAG", merge: "union", values: ["x", "y"] },
  kind: {
    description: "Its kind",
    kind: "choice",
    label: "Kind",
    field: "KIND",
    merge: "fallback",
    values: ["Arcane", "Divine"],
  },
  owner: {
    description: "Who owns it",
    kind: "ref",
    label: "Owner",
    references: GIZMOS,
    role: "owner",
  },
} as const;

const CODEC = new FieldCodec(FIELDS);

/** What a form's fields are read with: ids the view resolves by prefixing them. */
const CONTEXT: FormContext = {
  resolve: (_type, id) => {
    if (id === "unknown") throw new RulesError("invalid", `Gizmo ${id} does not belong to this ruleset`);
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
    merge: "union",
  },
} as const);

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
        heldValues([
          ["FLAG", false],
          ["FLAG", true],
        ]),
      ).flag,
    ).toBe(true);
    expect(CODEC.read(heldValues([["KNOWN", false]])).group.known).toBe(false);
    expect(
      CODEC.read(
        heldValues([
          ["KNOWN", false],
          ["KNOWN", true],
        ]),
      ).group.known,
    ).toBe(true);
  });

  test("reads a number off the first value that's one in its bounds (as text too), and its default otherwise", () => {
    // The flag its condition reads keeps the count, which counts only while it's on
    const counted = (...counts: FieldValue[]) =>
      heldValues([["FLAG", true], ...counts.map((count): [string, FieldValue] => ["COUNT", count])]);
    expect(CODEC.read(counted("x", 0, 3, 4)).count).toBe(3);
    expect(CODEC.read(counted(0)).count).toBe(1);
    expect(
      CODEC.read(
        heldValues([
          ["LEVEL", ""],
          ["LEVEL", -2],
        ]),
      ).group.level,
    ).toBe(-2);
    expect(
      CODEC.read(
        heldValues([
          ["LEVEL", true],
          ["LEVEL", "7"],
        ]),
      ).group.level,
    ).toBe(7);
  });

  test("reads a text off its first value and a reference off its link, a choice only among its values, a list whole", () => {
    const read = CODEC.read(
      heldValues(
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
    expect(CODEC.read(heldValues([["KIND", "Divine"]])).kind).toBe("Divine");
    // A value stored outside its field's closed list still reads
    expect(CODEC.read(heldValues([["SCHOOL", "Sorcery"]])).school).toBe("Sorcery");
    // A reference reads its link alone, no field
    expect(CODEC.read(heldValues([["owner", "id-1"]])).owner).toBeNull();
  });

  test("writes the fields and links it reads back: each field's values in order, a reference's as its link", () => {
    const written = writtenValues(CODEC.write({ ...CODEC.defaults, owner: "id-1", tags: ["y", "x"], title: "A" }));
    expect(written).toEqual({ fields: { TITLE: ["A"], TAG: ["y", "x"] }, links: { owner: "id-1" } });
    expect(CODEC.read(written)).toMatchObject({ owner: "id-1", tags: ["y", "x"], title: "A" });
  });

  test("writes a field with a value, of its kind, none for a default number, an empty text or a false two-state flag", () => {
    const values = { ...CODEC.defaults, flag: false, group: { known: false, level: 2 }, tags: ["x"], title: "A" };
    expect(writtenValues(CODEC.write(values)).fields).toEqual({
      TITLE: ["A"],
      LEVEL: [2],
      KNOWN: [false],
      TAG: ["x"],
    });
    expect(CODEC.write({ ...values, title: "" }).fields.TITLE).toEqual([]);
  });

  test("writes nothing when the entity keeps no field, a save's write names every field and link, a part its own", () => {
    expect(writtenValues(CODEC.write({ ...CODEC.defaults, count: 5 }))).toEqual({ fields: {}, links: {} });
    expect(CODEC.write({ ...CODEC.defaults, title: "A" })).toEqual({
      fields: { TITLE: ["A"], SCHOOL: [], FLAG: [], LEVEL: [], KNOWN: [], COUNT: [], TAG: [], KIND: [] },
      links: { owner: null },
    });
    // The fields the values leave out aren't named: their owner keeps them
    expect(CODEC.write({ owner: null, title: "A" })).toEqual({ fields: { TITLE: ["A"] }, links: { owner: null } });
    expect(CODEC.write({ group: { known: true, level: null }, title: "A" })).toEqual({
      fields: { KNOWN: [true], LEVEL: [], TITLE: ["A"] },
      links: {},
    });
  });

  test("reads and writes a field on its condition, and merges an edit's given fields over the kept", () => {
    const written = (values: typeof CODEC.defaults) => writtenValues(CODEC.write(values)).fields;
    expect(CODEC.read(heldValues([["COUNT", 3]])).count).toBe(1);
    expect(written({ ...CODEC.defaults, count: 3, title: "A" })).toEqual({ TITLE: ["A"] });
    expect(written({ ...CODEC.defaults, count: 3, flag: true, title: "A" })).toEqual({
      TITLE: ["A"],
      FLAG: [true],
      COUNT: [3],
    });
    expect(CODEC.merge({ ...CODEC.defaults, title: "A" }, { count: 2, title: undefined })).toMatchObject({
      count: 2,
      title: "A",
    });
  });

  test("writes what another's values don't hold, clearing the rest: an item's over its template's", () => {
    const template = { ...CODEC.defaults, owner: "id-1", tags: ["y", "x"], title: "A" };
    const same = CODEC.toOverrides({ ...template, tags: ["x", "y"] }, template);
    expect(same).toEqual({ ...CODEC.write(CODEC.defaults), links: { owner: null } });
    expect(writtenValues(same)).toEqual({ fields: {}, links: {} });
    const overrides = CODEC.toOverrides(
      { ...template, group: { known: false, level: null }, owner: "id-2", title: "B" },
      template,
    );
    expect(writtenValues(overrides)).toEqual({
      fields: { TITLE: ["B"], KNOWN: [false] },
      links: { owner: "id-2" },
    });
  });

  test("reads a form's fields with each field's shape, those it gives, refusing one past its bounds or values", () => {
    const parse = (fields: unknown, kept?: Record<string, unknown>) => CODEC.parse({ fields }, { ...CONTEXT, kept });
    expect(CODEC.parse({}, CONTEXT)).toEqual({});
    expect(parse({ TAG: ["x"], TITLE: "", SCHOOL: "Illusion", KNOWN: null, LEVEL: 2 })).toEqual({
      group: { known: null, level: 2 },
      school: "Illusion",
      tags: ["x"],
      title: "",
    });
    // A group's fields it gives alone
    expect(parse({ LEVEL: 3 })).toEqual({ group: { level: 3 } });
    for (const invalid of [{ FLAG: true, COUNT: 0 }, { FLAG: true, COUNT: 2.5 }, { KIND: "Psionic" }, { TAG: ["z"] }])
      expect(() => parse(invalid)).toThrow(RulesError);
    // A number past what it holds exactly, its declared maximum or none
    for (const invalid of [{ FLAG: true, COUNT: 1e21 }, { LEVEL: Number.MAX_SAFE_INTEGER + 1 }])
      expect(() => parse(invalid)).toThrow(RulesError);
    expect(parse({ FLAG: true, COUNT: Number.MAX_SAFE_INTEGER })).toEqual({
      flag: true,
      count: Number.MAX_SAFE_INTEGER,
    });
    expect(() => parse({ SCHOOL: "Sorcery" })).toThrow(
      expect.objectContaining({ issues: [expect.objectContaining({ category: "fields.SCHOOL" })] }),
    );
  });

  test("refuses a value outside its type's values the entity keeps, a key that's no field", () => {
    const kept = { ...CODEC.defaults, school: "Sorcery", tags: ["z"] };
    expect(() => CODEC.parse({ fields: { SCHOOL: "Sorcery" } }, { ...CONTEXT, kept })).toThrow(RulesError);
    expect(() => CODEC.parse({ fields: { TAG: ["z", "x"] } }, { ...CONTEXT, kept })).toThrow(RulesError);
    expect(() => CODEC.parse({ fields: { TITLE: "A", UNKNOWN: "x" }, links: { stranger: "x" } }, CONTEXT)).toThrow(
      expect.objectContaining({
        issues: [
          { category: "fields.UNKNOWN", message: "Not a field of this entity" },
          { category: "links.stranger", message: "Not a field of this entity" },
        ],
      }),
    );
    // A field's name in its spec is no stored field: a form sends each by the stored field that keeps it
    expect(() => CODEC.parse({ fields: { title: "A" } }, CONTEXT)).toThrow(RulesError);
  });

  test("drops a field its condition leaves out, read over what the entity keeps", () => {
    // The count counts only while the flag is on: given with it off, it's dropped, whatever it holds
    expect(CODEC.parse({ fields: { COUNT: null, FLAG: false } }, CONTEXT)).toEqual({ flag: false });
    expect(CODEC.parse({ fields: { COUNT: 2 } }, { ...CONTEXT, kept: { ...CODEC.defaults, flag: true } })).toEqual({
      count: 2,
    });
  });

  test("reads a reference by its link's role as the id the view keys its entity by, none for an empty one, refused for an unknown one", () => {
    expect(CODEC.parse({ links: { owner: "id-1" } }, CONTEXT)).toEqual({ owner: "view-id-1" });
    expect(CODEC.parse({ links: { owner: "" } }, CONTEXT)).toEqual({ owner: null });
    expect(() => CODEC.parse({ links: { owner: "unknown" } }, CONTEXT)).toThrow(RulesError);
    expect(CODEC.resolveReferences({ ...CODEC.defaults, owner: "id-1" }, (id) => `copy-${id}`).owner).toBe("copy-id-1");
  });

  test("holds a group's fields given alone over those kept, as an edit's form gives those it changes", () => {
    const kept = { ...CODEC.defaults, group: { known: true, level: 4 } };
    expect(CODEC.merge(kept, { group: { level: 5 } } as never).group).toEqual({ known: true, level: 5 });
  });

  test("gives its values as its form holds them: by the stored field that keeps each, a reference by its role", () => {
    expect(CODEC.toForm({ ...CODEC.defaults, owner: "id-1", group: { known: true, level: 2 } })).toEqual({
      fields: {
        TITLE: null,
        SCHOOL: null,
        FLAG: false,
        LEVEL: 2,
        KNOWN: true,
        COUNT: 1,
        TAG: [],
        KIND: null,
      },
      links: { owner: "id-1" },
    });
  });

  test("describes its fields as a form shows them, in the order they're declared, groups last", () => {
    const fields = CODEC.describe();
    expect(
      fields.map((field) => [field.input === "group" ? field.label : (field.field ?? field.role), field.input]),
    ).toEqual([
      ["TITLE", "text"],
      ["SCHOOL", "choice"],
      ["FLAG", "flag"],
      ["COUNT", "number"],
      ["TAG", "choice"],
      ["KIND", "choice"],
      ["owner", "ref"],
      ["Group", "group"],
    ]);
    // Each with the stored field that keeps it, a reference with its link's role
    expect(fields[0]).toMatchObject({
      field: "TITLE",
      label: "Title",
      help: "Its title",
      multiple: false,
      placeholder: 'e.g., "A"',
    });
    expect(fields[1]).toMatchObject({ multiple: false, options: ["Evocation", "Illusion"] });
    expect(fields[3]).toMatchObject({ default: 1, min: 1, shownWhen: [{ path: "fields.FLAG", values: [true] }] });
    // A number's maximum: its declared one, or the largest it holds exactly
    expect(fields[3]).toMatchObject({ max: Number.MAX_SAFE_INTEGER });
    expect(fields[4]).toMatchObject({ multiple: true, options: ["x", "y"] });
    expect(fields[5]).toMatchObject({ options: ["Arcane", "Divine"] });
    expect(fields[6]).toMatchObject({ references: GIZMOS, required: false, role: "owner" });
    expect(fields[6]).not.toHaveProperty("field");
    expect(fields[7]).toMatchObject({
      label: "Group",
      shownWhen: [{ path: "fields.TYPE", values: ["Tool"] }],
      fields: [
        { field: "LEVEL", input: "number", default: null, max: Number.MAX_SAFE_INTEGER },
        { field: "KNOWN", input: "flag", nullable: true },
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
    // Not on its own: in each group, by the stored field that keeps it
    expect(fields.map((field) => (field.input === "group" ? field.label : field.field))).toEqual([
      "TITLE",
      "First",
      "Second",
    ]);
    const keysIn = (field: (typeof fields)[number]) =>
      field.input === "group" ? field.fields.map((inner) => (inner.input === "group" ? "" : inner.field)) : [];
    expect(keysIn(fields[1]!)).toEqual(["KIND", "LEVEL"]);
    expect(keysIn(fields[2]!)).toEqual(["KIND", "KNOWN"]);

    expect(
      codec.read(
        heldValues([
          ["KIND", "Divine"],
          ["LEVEL", 2],
        ]),
      ),
    ).toMatchObject({ first: { level: 2 }, kind: "Divine" });
    expect(codec.parse({ fields: { KIND: "Arcane" } }, CONTEXT)).toEqual({ kind: "Arcane" });
  });
});

describe("A codec's fields its form doesn't show", () => {
  /**
   * A kind's fields: a column's (its weight, kept to two places), one its rules alone set and always write (whether it's
   * generated), a text always written with its default (its slot), and one its form shows (its title).
   */
  const OWNED = new FieldCodec({
    weight: {
      description: "Its weight",
      field: "WEIGHT",
      form: "column",
      kind: "number",
      label: "Weight",
      merge: "winner",
      min: 0,
      scale: 2,
    },
    generated: {
      default: true,
      description: "Whether its rules made it",
      field: "GENERATED",
      form: "hidden",
      kind: "flag",
      label: "Generated",
      merge: "winner",
      write: "always",
    },
    slot: {
      default: "Other",
      description: "Where it's worn",
      field: "SLOT",
      form: "column",
      kind: "text",
      label: "Slot",
      merge: "winner",
      values: ["Head", "Other"],
      write: "always",
    },
    title: { description: "Its title", field: "TITLE", kind: "text", label: "Title", merge: "winner" },
  } as const);

  test("read as any other, their defaults without a row, and by the stored field that keeps each", () => {
    expect(OWNED.read(OwnerValues.NONE)).toEqual({ generated: true, slot: "Other", title: null, weight: null });
    expect(
      OWNED.readByField(
        heldValues([
          ["WEIGHT", 2.5],
          ["GENERATED", false],
          ["TITLE", "A"],
        ]),
      ),
    ).toEqual({
      WEIGHT: 2.5,
      GENERATED: false,
      SLOT: "Other",
      TITLE: "A",
    });
  });

  test("are written always where they say so, their default without a value", () => {
    expect(OWNED.write({ generated: false, slot: "", title: null, weight: null })).toEqual({
      fields: { WEIGHT: [], GENERATED: [false], SLOT: ["Other"], TITLE: [] },
      links: {},
    });
  });

  test("are left out of its form: its keys, its description, what it reads and what an edit merges", () => {
    expect(OWNED.formNames).toEqual(["title"]);
    expect(OWNED.describe().map((field) => (field.input === "group" ? field.label : field.field))).toEqual(["TITLE"]);
    expect(() => OWNED.parse({ fields: { WEIGHT: 3 } }, CONTEXT)).toThrow(RulesError);
    expect(OWNED.merge({ ...OWNED.defaults, weight: 3 }, { title: "B" })).toEqual({ title: "B" });
  });
});

describe("A progression", () => {
  test("reads its frequency and each level's first more in its bounds, at most its bound; its default without a value", () => {
    expect(PROGRESSION.defaults).toEqual({ grants: { every: 3, extra: [{ amount: 1, level: 1 }] } });
    expect(PROGRESSION.read(OwnerValues.NONE)).toEqual(PROGRESSION.defaults);
    const held = heldValues([
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
        heldValues([
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
    expect(PROGRESSION.read(heldValues([["GRANT", "every:0"]]))).toEqual({ grants: { every: 0, extra: [] } });
    for (const values of [
      heldValues([
        ["GRANT", "every:11"],
        ["GRANT", "5:1"],
      ]),
      heldValues([["GRANT", "6:1"]]),
    ])
      expect(PROGRESSION.read(values)).toEqual(PROGRESSION.defaults);
  });

  test("writes its frequency's value and one per level it gives more at, which read back", () => {
    const grants = { every: 0, extra: [{ amount: 2, level: 4 }] };
    expect(PROGRESSION.write({ grants }).fields).toEqual({ GRANT: ["every:0", "4:2"] });
    expect(PROGRESSION.read(writtenValues(PROGRESSION.write({ grants })))).toEqual({ grants });
    expect(PROGRESSION.write({ grants: { every: 5, extra: [] } }).fields).toEqual({ GRANT: ["every:5"] });
  });

  test("reads a form's progression sorted by level, refusing a level listed twice or giving past its bound", () => {
    const parse = (grants: unknown) => PROGRESSION.parse({ fields: { GRANT: grants } }, CONTEXT);
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
      expect.objectContaining({ issues: [expect.objectContaining({ category: "fields.GRANT.extra.0.amount" })] }),
    );
  });

  test("describes its default and its bounds", () => {
    expect(PROGRESSION.describe()).toEqual([
      {
        default: { every: 3, extra: [{ amount: 1, level: 1 }] },
        field: "GRANT",
        help: "What each level grants",
        input: "progression",
        label: "Grants",
        levels: 10,
        max: 2,
      },
    ]);
  });
});
