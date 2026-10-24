import { describe, expect, test } from "bun:test";

import { CowDataBuilder, type CowRows } from "@/engine/core/cow/index.ts";

/** No rows of any kind. */
const NO_ROWS: CowRows = { identities: [], namesakes: [], owned: [], ownNamesakes: [], snapshots: [] };

/** A fork of a base, of a made-up module's kinds. */
const RULESET = { ancestorRulesetIds: ["base"], extensionRulesetIds: [], id: "fork" };

describe("A ruleset's copy-on-write data, built by its module's kinds", () => {
  test("pairs an owner's owned entities by kind and position with those of the owner standing for it", () => {
    const owned = (entityType: string, id: string, ownerId: string, position: number) => ({
      entityType,
      id,
      ownerId,
      position,
    });
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
    const row = (entityType: string, id: string, rulesetId: string) => ({ entityType, id, name: "General", rulesetId });
    const cow = CowDataBuilder.build(
      { ...RULESET, extensionRulesetIds: ["book"] },
      {
        ...NO_ROWS,
        identities: [row("pools", "p1", "fork"), row("pools", "p2", "book"), row("lists", "x1", "book")],
      },
    );

    expect(["p2", "x1"].map((id) => cow.resolve(id))).toEqual(["p1", "x1"]);
    expect(cow.getSiblings("p1")).toEqual(["p2"]);
  });
});
