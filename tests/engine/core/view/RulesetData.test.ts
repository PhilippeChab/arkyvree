import { describe, expect, test } from "bun:test";

import { CowData } from "@/engine/core/cow/index.ts";
import { RulesetComposition, type ViewSchema } from "@/engine/core/view/index.ts";
import type { Requirement } from "@/shared/relations.ts";
import { NO_FIELDS, rawRows } from "@/tests/support/composedViews.ts";

/**
 * A made-up module whose characters carry satchels: a kind its inventory holds, a satchel a template when its flag says,
 * and one patterned on another reading its color off it; and trinkets, which no inventory holds.
 */
const SCHEMA: ViewSchema = {
  kinds: [
    {
      type: "satchels",
      customizable: true,
      fields: true,
      inherits: { fields: new Set(["COLOR"]), role: "patternedOn" },
      inventory: true,
      template: "PATTERN",
      tracked: false,
    },
    { type: "trinkets", customizable: false, fields: false, tracked: false },
  ],
  unionLinks: [],
};

/** The made-up ruleset's view: a pattern satchel, a satchel patterned on it, and a trinket, each with a requirement. */
function composeSatchels() {
  const rows = rawRows({
    satchels: [
      { id: "pattern", fields: { PATTERN: true }, links: {} },
      { id: "patterned", fields: { PATTERN: false }, links: { patternedOn: "pattern" } },
    ],
    trinkets: [{ id: "trinket", fields: {}, links: {} }],
  });
  rows.requirements = [
    requirementOn("pattern", "satchels"),
    requirementOn("patterned", "satchels"),
    requirementOn("trinket", "trinkets"),
  ];
  const cow = new CowData(["base"], new Map(), new Map(), new Map(), new Set());
  return new RulesetComposition([rows], cow, NO_FIELDS, SCHEMA, {}).build();
}

/** A requirement on an entity (`entityId`, of `entityType`). */
function requirementOn(entityId: string, entityType: string) {
  return { id: `r-${entityId}`, entityId, entityType, level: "1" } as Requirement;
}

describe("RulesetData", () => {
  test("reads the kinds a character's inventory holds, and an entry's item, from what its modules declare", () => {
    const view = composeSatchels();

    expect(view.inventoryTypes()).toEqual(["satchels"]);
    expect(["satchels", "trinkets", "unknown"].map((type) => view.isInventoryType(type))).toEqual([true, false, false]);
    expect(view.findItem("patterned")).toMatchObject({ id: "patterned" });
    // An entry naming no entity of the kinds the inventory holds is left out, as one naming none at all
    const entries = [{ itemId: "patterned" }, { itemId: "trinket" }, { itemId: "gone" }];
    expect(view.entriesWithItems(entries).map(({ item }) => item.id)).toEqual(["patterned"]);
  });

  test("splits an entity's requirements by its kind's template flag and the role it reads its template through", () => {
    const view = composeSatchels();
    const [pattern, patterned] = ["pattern", "patterned"].map((id) => view.findItem(id)!);

    expect(view.templateRequirements("satchels", pattern)).toEqual({
      own: [],
      template: [requirementOn("pattern", "satchels")],
    });
    expect(view.templateRequirements("satchels", patterned)).toEqual({
      own: [requirementOn("patterned", "satchels")],
      template: [requirementOn("pattern", "satchels")],
    });
    // A kind that declares neither keeps them all its own
    expect(view.templateRequirements("trinkets", { fields: {}, id: "trinket", links: {} })).toEqual({
      own: [requirementOn("trinket", "trinkets")],
      template: [],
    });
  });
});
