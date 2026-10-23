import { describe, expect, test } from "bun:test";

import StorageEngine from "@/engine/api/StorageEngine.ts";

/** The text an item's weight is written as, from what its form gives. */
function writtenWeight(weight: string) {
  const write = StorageEngine.shared().writeOf("items", { name: "Pebble", rulesetId: "r", weight }, true);
  return write.fields.find((field) => field.field === "ITEM_WEIGHT")?.value;
}

describe("A kind's write", () => {
  test("rounds a decimal to its scale, half away from zero, as Postgres's round does", () => {
    expect(writtenWeight("1.005")).toBe("1.01");
    expect(writtenWeight("0.000001")).toBe("0.00");
    expect(writtenWeight("-2.345")).toBe("-2.35");
  });

  test("reads a decimal JavaScript writes in exponent form (below 1e-6)", () => {
    expect(writtenWeight(String(0.0000001))).toBe("0.00");
    expect(writtenWeight("1.5e2")).toBe("150.00");
  });
});
