import { describe, expect, test } from "bun:test";

import type { PropertyTypesProvider } from "@/engine/core/customizations/index.ts";
import { Field, FieldCodec, type FormContext } from "@/engine/core/fields/index.ts";
import RulesError from "@/engine/core/RulesError.ts";

const CODEC = new FieldCodec(
  {
    count: Field.when({ field: "flag", values: [true] }, Field.number("COUNT", { default: 1, min: 1 })),
    flag: Field.flag("FLAG"),
    group: Field.when(
      { column: "type", values: ["Weapon"] },
      Field.group("Group", { known: Field.flag("KNOWN", { absent: null }), level: Field.number("LEVEL") }),
    ),
    kind: Field.choice("KIND", ["Arcane", "Divine"] as const),
    owner: Field.ref("OWNER"),
    school: Field.text("SCHOOL"),
    tags: Field.list("TAG"),
    title: Field.text("TITLE"),
  },
  { storesWhen: (fields) => fields.title !== null },
);

/** The rules' declarations of the codec's types: their labels, the closed lists, and a reference to an ability. */
const DECLARATIONS: PropertyTypesProvider = {
  getDeclarations: () => ({
    TITLE: { description: "Its title", label: "Title", placeholder: 'e.g., "A"' },
    SCHOOL: { description: "Its school", label: "School" },
    FLAG: { description: "Whether it's on", label: "Flag" },
    COUNT: { description: "How many", label: "Count" },
    TAG: { description: "Its tags", label: "Tags" },
    KIND: { description: "Its kind", label: "Kind" },
    OWNER: { description: "Who owns it", label: "Owner" },
    LEVEL: { description: "Its level", label: "Level" },
    KNOWN: { description: "Whether it's known", label: "Known" },
  }),
  getReferencedEntityType: (type) => (type === "OWNER" ? "abilities" : null),
  getValues: (type) => ({ SCHOOL: ["Evocation", "Illusion"], TAG: ["x", "y"] })[type] ?? null,
};

/** What a form's fields are read with: the declarations, and ids the view resolves by prefixing them. */
const CONTEXT: FormContext = {
  declarations: DECLARATIONS,
  entityType: "items",
  resolve: (_type, id) => {
    if (id === "unknown") throw new RulesError("invalid", `Ability ${id} does not belong to this ruleset`);
    return `view-${id}`;
  },
};

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
      school: null,
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
    // The flag its condition reads keeps the count, which counts only while it's on
    const counted = (...counts: string[]) =>
      rows(["FLAG", "true"], ...counts.map((count): [string, string] => ["COUNT", count]));
    expect(CODEC.read(counted("x", "0", "3", "4")).count).toBe(3);
    expect(CODEC.read(counted("0")).count).toBe(1);
    expect(CODEC.read(rows(["LEVEL", ""], ["LEVEL", "-2"])).group.level).toBe(-2);
  });

  test("reads a text and a reference off their first row, a choice only among its values, a list whole", () => {
    const read = CODEC.read(
      rows(["TITLE", "A"], ["TITLE", "B"], ["OWNER", "id-1"], ["KIND", "Psionic"], ["TAG", "x"], ["TAG", "y"]),
    );
    expect([read.title, read.owner, read.kind, read.tags]).toEqual(["A", "id-1", null, ["x", "y"]]);
    expect(CODEC.read(rows(["KIND", "Divine"])).kind).toBe("Divine");
    // A stored value outside its type's closed list still reads
    expect(CODEC.read(rows(["SCHOOL", "Sorcery"])).school).toBe("Sorcery");
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
    expect(CODEC.write({ ...CODEC.defaults, title: "A" })).toEqual({
      types: ["COUNT", "FLAG", "KNOWN", "LEVEL", "KIND", "OWNER", "SCHOOL", "TAG", "TITLE"],
      values: [{ type: "TITLE", value: "A" }],
    });
  });

  test("reads and writes a field on its condition, and merges an edit's given fields over the kept", () => {
    expect(CODEC.read([{ type: "COUNT", value: "3" }]).count).toBe(1);
    expect(CODEC.toProperties({ ...CODEC.defaults, count: 3, title: "A" })).toEqual([{ type: "TITLE", value: "A" }]);
    expect(CODEC.toProperties({ ...CODEC.defaults, count: 3, flag: true, title: "A" })).toEqual([
      { type: "COUNT", value: "3" },
      { type: "FLAG", value: "true" },
      { type: "TITLE", value: "A" },
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
      { type: "KNOWN", value: "false" },
      { type: "TITLE", value: "B" },
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

  test("refuses a value outside its type's values the entity keeps, a key that's no declared field", () => {
    const kept = { ...CODEC.defaults, school: "Sorcery", tags: ["z"] };
    expect(() => CODEC.parse({ school: "Sorcery" }, { ...CONTEXT, kept })).toThrow(RulesError);
    expect(() => CODEC.parse({ tags: ["z", "x"] }, { ...CONTEXT, kept })).toThrow(RulesError);
    expect(() => CODEC.parse({ title: "A", unknown: "x" }, CONTEXT)).toThrow(
      expect.objectContaining({ issues: [{ category: "fields.unknown", message: "Not a field of this entity" }] }),
    );
    // A field whose type the entity type doesn't declare is none of its form's, and none a save takes
    const declaredWithoutTitle = {
      ...DECLARATIONS,
      getDeclarations: () => ({ SCHOOL: DECLARATIONS.getDeclarations().SCHOOL }),
    };
    expect(() => CODEC.parse({ title: "A" }, { ...CONTEXT, declarations: declaredWithoutTitle })).toThrow(RulesError);
    expect(CODEC.describe(declaredWithoutTitle, "items").map((field) => field.key)).toEqual(["school"]);
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

  test("describes its fields as a form shows them, in the order their types are declared, groups last", () => {
    const fields = CODEC.describe(DECLARATIONS, "items");
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
    expect(fields[3]).toMatchObject({ default: 1, min: 1, shownWhen: { path: "fields.flag", values: [true] } });
    expect(fields[4]).toMatchObject({ multiple: true, options: ["x", "y"] });
    expect(fields[5]).toMatchObject({ options: ["Arcane", "Divine"] });
    expect(fields[6]).toMatchObject({ references: "abilities", required: false });
    expect(fields[7]).toMatchObject({
      label: "Group",
      shownWhen: { path: "type", values: ["Weapon"] },
      fields: [
        { key: "group.level", input: "number", default: null },
        { key: "group.known", input: "flag", nullable: true },
      ],
    });
  });

  test("shows a field in the groups it names, among their own in declared order, its value its own all the same", () => {
    const codec = new FieldCodec({
      first: Field.group("First", { level: Field.number("LEVEL") }),
      kind: Field.shownIn(["first", "second"], Field.choice("KIND", ["Arcane", "Divine"] as const)),
      second: Field.group("Second", { known: Field.flag("KNOWN", { absent: null }) }),
      title: Field.text("TITLE"),
    });
    const fields = codec.describe(DECLARATIONS, "items");
    // Not on its own: in each group, keyed where its value goes
    expect(fields.map((field) => field.key)).toEqual(["title", "first", "second"]);
    const keysIn = (field: (typeof fields)[number]) =>
      field.input === "group" ? field.fields.map((inner) => inner.key) : [];
    expect(keysIn(fields[1]!)).toEqual(["kind", "first.level"]);
    expect(keysIn(fields[2]!)).toEqual(["kind", "second.known"]);

    expect(codec.read(rows(["KIND", "Divine"], ["LEVEL", "2"]))).toMatchObject({ first: { level: 2 }, kind: "Divine" });
    expect(codec.parse({ kind: "Arcane" }, CONTEXT)).toEqual({ kind: "Arcane" });
  });
});
