import { describe, expect, test } from "bun:test";

import { EMPTY_ITEM } from "@/client/src/pages/rulesets/components/forms/dnd3.5/emptyForms.ts";
import {
  fieldsClearedByType,
  templateOptions,
  toItemPayload,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/itemForm.ts";

const WEAPON_TEMPLATES = [
  { id: "club", name: "Club" },
  { id: "dagger", name: "Dagger" },
];

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

  test.each(["Wondrous Item", "Ring", "Other", ""])("drops its template when its type changes to %p", (type) => {
    expect(fieldsClearedByType(type)).toEqual(["sourceItemId"]);
  });

  test.each(["Weapon", "Armor", "Shield"])("drops its template and its slot when its type changes to %p", (type) => {
    expect(fieldsClearedByType(type)).toEqual(["slot", "sourceItemId"]);
  });

  describe("template select", () => {
    test("offers no template until its type's load", () => {
      expect(templateOptions(undefined, "ring", "Ring of Blades")).toEqual([]);
    });

    test.each([undefined, "", "dagger"])("offers its type's templates while it holds %p", (held) => {
      expect(templateOptions(WEAPON_TEMPLATES, held, "Dagger")).toEqual([
        { value: "club", label: "Club" },
        { value: "dagger", label: "Dagger" },
      ]);
    });

    test("shows a held template of another type, which can't be picked again", () => {
      expect(templateOptions(WEAPON_TEMPLATES, "ring", "Ring of Blades").at(-1)).toEqual({
        value: "ring",
        label: "Ring of Blades (of another type)",
        disabled: true,
      });
      expect(templateOptions([], "lost", undefined)).toEqual([
        { value: "lost", label: "Template (of another type)", disabled: true },
      ]);
    });
  });
});
