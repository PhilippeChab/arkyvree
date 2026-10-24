import { describe, expect, test } from "bun:test";

import { CowDataBuilder, type CowRows } from "@/engine/core/cow/index.ts";

/** No rows of any kind. */
const NO_ROWS: CowRows = { identities: [], namesakes: [], owned: [], ownNamesakes: [], snapshots: [] };

/** A fork of a base, of a made-up module's kinds. */
const RULESET = { ancestorRulesetIds: ["base"], extensionRulesetIds: [], id: "fork" };

/** An entity of a kind a name is the identity of, named "General", of a ruleset. */
function named(entityType: string, id: string, rulesetId: string) {
  return { entityType, id, name: "General", rulesetId };
}

/** An owned entity of a kind, at its position in its owner. */
function owned(entityType: string, id: string, ownerId: string, position: number) {
  return { entityType, id, ownerId, position };
}

describe("A ruleset's copy-on-write data, built by its module's kinds", () => {
  test("pairs an owner's owned entities by kind and position with those of the owner standing for it", () => {
    const cow = CowDataBuilder.build(RULESET, {
      ...NO_ROWS,
      owned: [
        owned("features", "f1", "o1", 1),
        owned("levels", "l1", "o1", 1),
        owned("levels", "l2", "o1", 2),
        owned("features", "f1c", "o1c", 1),
        owned("levels", "l1c", "o1c", 1),
      ],
      snapshots: [{ entityType: "owners", forkedEntityId: "o1c", rulesetId: "fork", sourceEntityId: "o1" }],
    });

    expect(["o1", "l1", "f1", "l2"].map((id) => cow.resolve(id))).toEqual(["o1c", "l1c", "f1c", "l2"]);
  });

  test("pairs the namesakes of a kind a name is the identity of, never two kinds' of one name", () => {
    const cow = CowDataBuilder.build(
      { ...RULESET, extensionRulesetIds: ["book"] },
      {
        ...NO_ROWS,
        identities: [named("pools", "p1", "fork"), named("pools", "p2", "book"), named("lists", "x1", "book")],
      },
    );

    expect(["p2", "x1"].map((id) => cow.resolve(id))).toEqual(["p1", "x1"]);
    expect(cow.getSiblings("p1")).toEqual(["p2"]);
  });
});
