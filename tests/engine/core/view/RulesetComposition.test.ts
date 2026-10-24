import { describe, expect, test } from "bun:test";

import { CowData } from "@/engine/core/cow/index.ts";
import { RulesetComposition } from "@/engine/core/view/index.ts";
import {
  composeView,
  idsOf,
  type Join,
  type Kind,
  NO_PROPERTY_TYPES,
  rawRows,
  VIEW_SCHEMA,
} from "@/tests/support/composedViews.ts";

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
    for (const customizations of [view.modifiersBySource, view.propertiesByEntity, view.requirementsByEntity]) {
      expect(customizations.get("a")).toBeUndefined();
      expect(customizations.get("b")).toHaveLength(1);
    }
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

  test("refuses a declaration that lists an owned kind before its owner", () => {
    const schema = { ...VIEW_SCHEMA, kinds: VIEW_SCHEMA.kinds.toReversed() };
    const cow = new CowData([], new Map(), new Map(), new Map(), new Set());
    const composition = new RulesetComposition([rawRows({})], cow, NO_PROPERTY_TYPES, () => false, schema, {});
    expect(() => composition.build()).toThrow("The view composes owned before its owner, owners");
  });
});
