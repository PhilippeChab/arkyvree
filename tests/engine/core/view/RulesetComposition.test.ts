import { describe, expect, test } from "bun:test";

import { CowData } from "@/engine/core/cow/index.ts";
import { DeclaredFields, type StoredValues } from "@/engine/core/fields/index.ts";
import type { FieldDef, LinkRoleDef } from "@/engine/core/module/index.ts";
import { RulesetComposition } from "@/engine/core/view/index.ts";
import {
  composeView,
  idsOf,
  type Kind,
  linkOf,
  NO_FIELDS,
  rawRows,
  VIEW_SCHEMA,
} from "@/tests/support/composedViews.ts";

/** What a made-up module's owners' field definitions share: a single value, its first sibling's without the winner's. */
const SINGLE = {
  inheritsVia: null,
  merge: "fallback",
  multiple: false,
  ownerKind: "entity",
  ownerType: "owners",
} as const;

/** The made-up owners' fields: a set in its closed list's order, two single values, and a link a field reads. */
const OWNER_FIELDS = new DeclaredFields(
  {
    owners: {
      set: { description: "Its set", field: "SET", kind: "list", label: "Set", values: ["c", "b", "a"] },
      one: { description: "Its one", field: "ONE", kind: "text", label: "One" },
      extra: { description: "Its extra", field: "EXTRA", kind: "text", label: "Extra" },
      ally: { description: "Its ally", kind: "ref", label: "Ally", references: "items", role: "ally" },
    },
  },
  {
    fieldDefs: [
      { ...SINGLE, field: "SET", merge: "union", multiple: true, valueKind: "text" },
      { ...SINGLE, field: "ONE", valueKind: "text" },
      { ...SINGLE, field: "EXTRA", valueKind: "text" },
    ] satisfies FieldDef[],
    linkRoles: [{ fromType: "owners", merge: "fallback", role: "ally" } as LinkRoleDef],
  },
);

/** A made-up ruleset's owners (`values`, by id) and its kind-wide values, as its raw data holds them. */
function ownersRaw(values: Record<string, StoredValues>) {
  const entries = Object.entries(values);
  const raw = rawRows({ owners: entries.map(([id]) => ({ id })) });
  const held = entries.flatMap(([id, { fields }]) =>
    Object.entries(fields).flatMap(([field, list]) => list.map((value) => ({ field, id, value }))),
  );
  return {
    ...raw,
    kindValues: new Map([
      ["owners", held.map(({ field, id, value }) => ({ entityIds: [id], field, value: String(value) }))],
    ]),
    values: new Map([["owners", new Map(entries)]]),
  };
}

describe("A ruleset's view, composed by its modules' declarations", () => {
  test("leaves out an owned entity and its customizations with an owner it doesn't show, whose links are its copy's", () => {
    const fork = rawRows({ owners: [{ id: "o1-copy" }], owned: [{ id: "c", ownerId: "o1-copy" }] }, [
      { type: "owners", links: [linkOf("o1-copy", "ally", "x")] },
    ]);
    const base = rawRows(
      {
        owners: [{ id: "o1" }, { id: "o2" }],
        owned: [
          { id: "a", ownerId: "o1" },
          { id: "b", ownerId: "o2" },
        ],
      },
      [
        { type: "owners", links: [linkOf("o1", "ally", "y")] },
        { type: "owners", links: [linkOf("o2", "ally", "y")] },
      ],
      ["a", "b"],
    );
    const view = composeView([fork, base], { overrides: [["o1", "o1-copy"]] });

    expect(idsOf(view, "owners")).toEqual(["o1-copy", "o2"]);
    // The copied owner's own entities are its copy's, and so are its links, by its stored id too
    expect(idsOf(view, "owned")).toEqual(["c", "b"]);
    expect(view.linksOf("o1")).toEqual([linkOf("o1-copy", "ally", "x")]);
    expect(view.linksOf("o2", "ally")).toEqual([linkOf("o2", "ally", "y")]);
    expect(view.linksOf("o2", "other")).toEqual([]);
    for (const customizations of [view.modifiersBySource, view.requirementsByEntity]) {
      expect(customizations.get("a")).toBeUndefined();
      expect(customizations.get("b")).toHaveLength(1);
    }
    expect(view.valuesOf("a").fields).toEqual({});
    expect(view.valuesOf("b").fields).toEqual({ T: ["v"] });
  });

  test("resolves an entity's links to the targets the view shows, and merges a sibling loser's of a role that merges", () => {
    const fork = rawRows({ targets: [{ id: "t1-copy", name: "First copy" }] });
    const book = rawRows({ listed: [{ id: "l3" }], targets: [{ id: "t3", name: "Third" }] }, [
      {
        type: "listed",
        links: [linkOf("l3", "listedIn", "t3"), linkOf("l3", "other", "t3"), linkOf("l3", "listedIn", "t2")],
      },
    ]);
    const base = rawRows(
      {
        listed: [{ id: "l1" }, { id: "l2" }],
        targets: [
          { id: "t1", name: "First" },
          { id: "t2", name: "Second" },
        ],
      },
      [
        { type: "listed", links: [linkOf("l1", "listedIn", "t1")] },
        { type: "listed", links: [linkOf("l2", "listedIn", "t2")] },
      ],
    );
    const view = composeView([fork, book, base], { overrides: [["t1", "t1-copy"]], siblings: [["l2", ["l3"]]] });

    const targets = (id: string) => view.nameLinks(view.linksOf(id)).map(({ toId, toName }) => [toId, toName]);
    expect(idsOf(view, "listed")).toEqual(["l1", "l2"]);
    expect(targets("l1")).toEqual([["t1-copy", "First copy"]]);
    // The loser's link of a role that doesn't merge stays its own, and one to a target the winner links to collapses
    expect(view.linksOf("l2").map(({ fromId, role, toId }) => [fromId, role, toId])).toEqual([
      ["l2", "listedIn", "t2"],
      ["l2", "listedIn", "t3"],
    ]);
    // A stored id finds its winner
    expect((view.find("listed" as Kind, "l3") as unknown as { id: string }).id).toBe("l2");
  });

  test("merges a sibling loser's stored values into its winner's, each field and link by its declared merge", () => {
    const base = ownersRaw({ o1: { fields: { SET: ["b"], ONE: ["w"] }, links: {} } });
    const book = ownersRaw({
      o2: { fields: { EXTRA: ["x"], ONE: ["l"], SET: ["a", "b", "c"] }, links: { ally: "t2" } },
    });
    const view = composeView([base, book], { siblings: [["o1", ["o2"]]] }, OWNER_FIELDS);

    // The set's values the winner lacks, in its closed list's order; a single value the winner's, else the loser's
    const merged = { fields: { SET: ["c", "b", "a"], ONE: ["w"], EXTRA: ["x"] }, links: { ally: "t2" } };
    expect(view.valuesOf("o1")).toEqual(merged);
    expect(Object.keys(view.valuesOf("o1").fields)).toEqual(["SET", "ONE", "EXTRA"]);
    // A stored id finds its winner's
    expect(view.valuesOf("o2")).toEqual(merged);
    // Kind-wide, the winner holds what it took from the loser, and the loser nothing it didn't give
    expect(view.kindValues("owners").map(({ entityIds, field, value }) => `${field}=${value}:${entityIds}`)).toEqual([
      "SET=c:o1",
      "SET=b:o1",
      "SET=a:o1",
      "ONE=w:o1",
      "EXTRA=x:o1",
    ]);
  });

  test("reuses an owner's stored values as its raw ruleset holds them, none for one that holds none", () => {
    const own = { fields: { ONE: ["mine"] }, links: {} };
    const raw = ownersRaw({ o1: own, o2: { fields: { EXTRA: ["theirs"], ONE: ["theirs"] }, links: {} } });
    const view = composeView([raw], {}, OWNER_FIELDS);
    expect(view.valuesOf("o1")).toBe(own);
    expect(view.valuesOf("missing")).toEqual({ fields: {}, links: {} });
    expect(view.rulesetValuesOf("base")).toEqual({ fields: {}, links: {} });
  });

  test("refuses a declaration that lists an owned kind before its owner", () => {
    const schema = { ...VIEW_SCHEMA, kinds: VIEW_SCHEMA.kinds.toReversed() };
    const cow = new CowData([], new Map(), new Map(), new Map(), new Set());
    const composition = new RulesetComposition([rawRows({})], cow, NO_FIELDS, schema, {});
    expect(() => composition.build()).toThrow("The view composes owned before its owner, owners");
  });
});
