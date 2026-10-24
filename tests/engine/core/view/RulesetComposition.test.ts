import { describe, expect, test } from "bun:test";

import { CowData } from "@/engine/core/cow/index.ts";
import {
  RulesetComposition,
  type RulesetData,
  type RulesetRawData,
  type ViewEntities,
  type ViewJoins,
  type ViewSchema,
} from "@/engine/core/view/index.ts";
import type { Modifier } from "@/shared/relations.ts";

/** A join of the made-up module the tests compose, by its name. */
type Join = keyof ViewJoins;

/** A kind of the made-up module the tests compose, by its name. */
type Kind = keyof ViewEntities;

const NO_PROPERTY_TYPES = { getTypes: () => [], getValues: () => null };

/**
 * A made-up module's declaration: owners and the entities they own, by `ownerId`; owners' links (`owner_links`); and
 * listed entities whose rows nest their links to targets (`links`, each with its target's row, `target`).
 */
const SCHEMA: ViewSchema = {
  kinds: [
    { type: "owners", tracked: true, lists: [] },
    { type: "targets", tracked: false, lists: [] },
    {
      type: "listed",
      tracked: false,
      lists: [{ name: "links", from: "listedId", target: "target", to: "targetId", toType: "targets" }],
    },
    { type: "owned", owner: { column: "ownerId", type: "owners" }, tracked: true, lists: [] },
  ],
  joins: [{ name: "owner_links", from: "owners", fromColumn: "ownerId" }],
};

/** The view a chain composes (`chain`, its own first), by its copy-on-write data's overrides, aliases and siblings. */
function compose(
  chain: RulesetRawData[],
  { overrides = [], siblings = [] }: { overrides?: [string, string][]; siblings?: [string, string[]][] } = {},
): RulesetData {
  const aliases = [...overrides, ...siblings.flatMap(([winner, losers]) => losers.map((loser) => [loser, winner]))];
  const cow = new CowData(
    ["base"],
    new Map(overrides),
    new Map(aliases as [string, string][]),
    new Map(siblings),
    new Set(),
  );
  return new RulesetComposition(chain, cow, NO_PROPERTY_TYPES, () => false, SCHEMA, { owners: "Owner" }).build();
}

/** A kind's rows' ids, as the view lists them. */
function idsOf(view: RulesetData, type: string) {
  return view.rows(type as Kind).map((row) => (row as { id: string }).id);
}

/** A ruleset's own rows of the made-up module: its kinds' and its join's, and modifiers on its entities. */
function raw(
  entities: Record<string, Record<string, unknown>[]>,
  joins: Record<string, Record<string, unknown>[]> = {},
  modifiers: string[] = [],
): RulesetRawData {
  return {
    entities: entities as RulesetRawData["entities"],
    joins,
    modifiers: modifiers.map((sourceId) => ({ id: `m-${sourceId}`, sourceId, sourceType: "owned" }) as Modifier),
    properties: [],
    requirements: [],
    tieredIds: new Set(),
  };
}

describe("A ruleset's view, composed by its modules' declarations", () => {
  test("leaves out an owned entity, its customizations and its owner's joins with an owner it doesn't show", () => {
    const fork = raw(
      { owners: [{ id: "o1-copy" }], owned: [{ id: "c", ownerId: "o1-copy" }] },
      {
        owner_links: [{ ownerId: "o1-copy", toId: "x" }],
      },
    );
    const base = raw(
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
    const view = compose([fork, base], { overrides: [["o1", "o1-copy"]] });

    expect(idsOf(view, "owners")).toEqual(["o1-copy", "o2"]);
    // The copied owner's own entities are its copy's
    expect(idsOf(view, "owned")).toEqual(["c", "b"]);
    expect(view.joinRows("owner_links" as Join)).toEqual([
      { ownerId: "o1-copy", toId: "x" },
      { ownerId: "o2", toId: "y" },
    ] as never);
    expect(view.modifiersBySource.get("a")).toBeUndefined();
    expect(view.modifiersBySource.get("b")).toHaveLength(1);
  });

  test("resolves a kind's list links to the targets the view shows, and merges a sibling loser's into its winner's", () => {
    const fork = raw({ targets: [{ id: "t1-copy", name: "First copy" }] });
    const book = raw({
      listed: [{ id: "l3", links: [{ listedId: "l3", targetId: "t3", target: { id: "t3" } }] }],
      targets: [{ id: "t3", name: "Third" }],
    });
    const base = raw({
      listed: [
        { id: "l1", links: [{ listedId: "l1", targetId: "t1", target: { id: "t1" } }] },
        { id: "l2", links: [{ listedId: "l2", targetId: "t2", target: { id: "t2" } }] },
      ],
      targets: [
        { id: "t1", name: "First" },
        { id: "t2", name: "Second" },
      ],
    });
    const view = compose([fork, book, base], { overrides: [["t1", "t1-copy"]], siblings: [["l2", ["l3"]]] });

    const links = (id: string) =>
      (view.find("listed" as Kind, id) as unknown as { links: { target: { name: string }; targetId: string }[] }).links;
    expect(idsOf(view, "listed")).toEqual(["l1", "l2"]);
    expect(links("l1").map(({ target, targetId }) => [targetId, target.name])).toEqual([["t1-copy", "First copy"]]);
    expect(links("l2").map(({ targetId }) => targetId)).toEqual(["t2", "t3"]);
    // A stored id finds its winner
    expect((view.find("listed" as Kind, "l3") as unknown as { id: string }).id).toBe("l2");
  });

  test("refuses a declaration that lists an owned kind before its owner", () => {
    const schema = { ...SCHEMA, kinds: SCHEMA.kinds.toReversed() };
    const cow = new CowData([], new Map(), new Map(), new Map(), new Set());
    const composition = new RulesetComposition([raw({})], cow, NO_PROPERTY_TYPES, () => false, schema, {});
    expect(() => composition.build()).toThrow("The view composes owned before its owner, owners");
  });
});

describe("A ruleset's view's reads", () => {
  const view = compose([raw({ owners: [{ id: "o1-copy" }] }), raw({ owners: [{ id: "o1" }, { id: "o2" }] })], {
    overrides: [["o1", "o1-copy"]],
  });

  test("find a kind's entity by a stored id, as resolving by id, and leave it unresolved as stored", () => {
    expect(view.byId("owners" as Kind).get("o1")).toEqual({ id: "o1-copy" } as never);
    expect(view.storedById("owners" as Kind).get("o1")).toBeUndefined();
    expect(view.storedById("owners" as Kind).get("o1-copy")).toEqual({ id: "o1-copy" } as never);
    expect(view.find("owners" as Kind, "missing")).toBeUndefined();
  });

  test("answer a join or a kind the module declares none of with no rows", () => {
    expect(view.joinRows("nothing" as Join)).toEqual([]);
    expect(view.rows("nothing" as Kind)).toEqual([]);
  });

  test("name a type by its module's label, or by itself for one it labels none of", () => {
    expect(view.labelOf("owners")).toBe("Owner");
    expect(view.labelOf("owned")).toBe("owned");
  });

  test("keep what a module derives of the view, built once", () => {
    class Derived {
      constructor(readonly data: RulesetData) {}
    }
    expect(view.derive(Derived)).toBe(view.derive(Derived));
    expect(view.derive(Derived).data).toBe(view);
  });
});
