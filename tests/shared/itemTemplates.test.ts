import { describe, expect, test } from "bun:test";

import { isTemplateItemType } from "@/shared/itemTemplates.ts";

describe("isTemplateItemType", () => {
  test("a weapon, an armor or a shield can be based on a template", () => {
    expect(["Weapon", "Armor", "Shield"].every(isTemplateItemType)).toBe(true);
  });

  test("another type, none or a value that isn't one can't", () => {
    expect(["Ring", "Wondrous Item", "", null, undefined, 3].some(isTemplateItemType)).toBe(false);
  });
});
