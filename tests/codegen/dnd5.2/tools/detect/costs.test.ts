import { describe, expect, test } from "bun:test";

import { readCost } from "@/codegen/dnd5.2/tools/detect/costs.ts";

describe("An item's cost", () => {
  test("is in gold pieces, to the hundredth", () => {
    expect(readCost({ quantity: 1500, unit: "gp" })).toBe(1500);
    expect(readCost({ quantity: 5, unit: "sp" })).toBe(0.5);
    expect(readCost({ quantity: 4, unit: "cp" })).toBe(0.04);
    expect(readCost({ quantity: 2, unit: "PP" })).toBe(20);
  });

  test("throws for a coin of none", () => {
    expect(() => readCost({ quantity: 1, unit: "zz" })).toThrow('"zz" is no coin');
  });
});
