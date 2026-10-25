import { describe, expect, test } from "bun:test";

import { CowData } from "@/engine/core/cow/index.ts";
import { DeclaredFields, type StoredValues } from "@/engine/core/fields/index.ts";
import type { FieldDef, LinkRoleDef } from "@/engine/core/module/index.ts";
import { RulesetComposition } from "@/engine/core/view/index.ts";
import {
  composeView,
  idsOf,
  type Join,
  type Kind,
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
      ally: { description: "Its ally", field: "ALLY", kind: "ref", label: "Ally", references: "items", role: "ally" },
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
  test("leaves out an owned entity, its customizations and its owner's joins with an owner it doesn't show", () => {
    const fork = rawRows(
      { owners: [{ id: "o1-copy" }], owned: [{ id: "c", ownerId: "o1-copy" }] },
      {
        owner_links: [{ ownerId: "o1-copy", toId: "x" }],
      },
    );
    const base = rawRows(
      {
        owners: [{ id: "o1" }, { id: "o2" }],
        owned: [
          { id: "a", ownerId: "o1" },
          { id: "b", ownerId: "o2" },
        ],
      },
      {
        owner_links: [
          { ownerId: "o1", toId: "x" },
          { ownerId: "o2", toId: "y" },
        ],
      },
      ["a", "b"],
    );
    const view = composeView([fork, base], { overrides: [["o1", "o1-copy"]] });

    expect(idsOf(view, "owners")).toEqual(["o1-copy", "o2"]);
    // The copied owner's own entities are its copy's
    expect(idsOf(view, "owned")).toEqual(["c", "b"]);
    expect(view.joinRows("owner_links" as Join)).toEqual([
      { ownerId: "o1-copy", toId: "x" },
      { ownerId: "o2", toId: "y" },
    ] as never);
    for (const customizations of [view.modifiersBySource, view.requirementsByEntity]) {
      expect(customizations.get("a")).toBeUndefined();
      expect(customizations.get("b")).toHaveLength(1);
    }
    expect(view.valuesOf("a").fields).toEqual({});
    expect(view.valuesOf("b").fields).toEqual({ T: ["v"] });
  });

  test("resolves a kind's list links to the targets the view shows, and merges a sibling loser's into its winner's", () => {
    const fork = rawRows({ targets: [{ id: "t1-copy", name: "First copy" }] });
    const book = rawRows({
      listed: [{ id: "l3", links: [{ listedId: "l3", targetId: "t3", target: { id: "t3" } }] }],
      targets: [{ id: "t3", name: "Third" }],
    });
    const base = rawRows({
      listed: [
        { id: "l1", links: [{ listedId: "l1", targetId: "t1", target: { id: "t1" } }] },
        { id: "l2", links: [{ listedId: "l2", targetId: "t2", target: { id: "t2" } }] },
      ],
      targets: [
        { id: "t1", name: "First" },
        { id: "t2", name: "Second" },
      ],
    });
    const view = composeView([fork, book, base], { overrides: [["t1", "t1-copy"]], siblings: [["l2", ["l3"]]] });

    const links = (id: string) =>
      (view.find("listed" as Kind, id) as unknown as { links: { target: { name: string }; targetId: string }[] }).links;
    expect(idsOf(view, "listed")).toEqual(["l1", "l2"]);
    expect(links("l1").map(({ target, targetId }) => [targetId, target.name])).toEqual([["t1-copy", "First copy"]]);
    expect(links("l2").map(({ targetId }) => targetId)).toEqual(["t2", "t3"]);
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
