import { describe, expect, test } from "bun:test";

import { EMPTY_ITEM } from "@/client/src/pages/rulesets/components/forms/dnd3.5/emptyForms.ts";
import { toItemPayload } from "@/client/src/pages/rulesets/components/forms/dnd3.5/itemForm.ts";

describe("an item's form", () => {
  test("sends null for the slot, template, weight and cost it leaves empty, which clears them", () => {
    expect(toItemPayload({ ...EMPTY_ITEM, name: "Hat" })).toMatchObject({
      slot: null,
      sourceItemId: null,
      weight: null,
      costGp: null,
    });
  });

  test("sends the slot, template, weight and cost it holds", () => {
    expect(
      toItemPayload({
        ...EMPTY_ITEM,
        name: "Sword",
        slot: "Main Hand",
        sourceItemId: "sword",
        weight: "4",
        costGp: "1.5",
      }),
    ).toMatchObject({ slot: "Main Hand", sourceItemId: "sword", weight: 4, costGp: 1.5 });
  });

  test("sends no template for a template", () => {
    expect(toItemPayload({ ...EMPTY_ITEM, name: "Sword", isTemplate: true, sourceItemId: "sword" })).toMatchObject({
      sourceItemId: null,
    });
  });
});
