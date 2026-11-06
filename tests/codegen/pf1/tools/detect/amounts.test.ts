import { describe, expect, test } from "bun:test";

import { readCost, readVariantAmounts, readWeight } from "@/codegen/pf1/tools/detect/amounts.ts";

describe("An item's cost", () => {
  test("is in gold pieces, its coins converted, its thousands' commas and an extra's plus read", () => {
    expect(readCost("1,500 gp")).toBe(1500);
    expect(readCost("5 sp")).toBe(0.5);
    expect(readCost("4 cp")).toBe(0.04);
    expect(readCost("+50 gp")).toBe(50);
    expect(readCost("8 gp Pack animal")).toBe(8);
  });

  test("is none for no cost, or a formula", () => {
    expect(readCost("")).toBe(0);
    expect(readCost("—")).toBe(0);
    expect(readCost("caster level × spell level × 10 gp")).toBe(0);
  });
});

describe("An item's weight", () => {
  test("is in pounds, its fractions and tons read", () => {
    expect(readWeight("6 lbs.")).toBe(6);
    expect(readWeight("1/2 lb.")).toBe(0.5);
    expect(readWeight("1-1/2 lbs.")).toBe(1.5);
    expect(readWeight("2,000 lbs.")).toBe(2000);
    expect(readWeight("1 ton")).toBe(2000);
    expect(readWeight("+10 lbs.")).toBe(10);
  });

  test("is none for no weight", () => {
    expect(readWeight("")).toBe(0);
    expect(readWeight("— (trained)")).toBe(0);
  });
});

describe("A line's amounts by variant", () => {
  test("are each variant's, by its note after its amount, a note's commas kept", () => {
    expect(readVariantAmounts("2 sp (gallon), 4 cp (mug)")).toEqual(
      new Map([
        ["gallon", "2 sp"],
        ["mug", "4 cp"],
      ]),
    );
    expect(readVariantAmounts("3 sp (common, per day), 1 sp (poor, per day)")).toEqual(
      new Map([
        ["common, per day", "3 sp"],
        ["poor, per day", "1 sp"],
      ]),
    );
    expect(readVariantAmounts("1 gp (common), 2,001 gp (mithral)").get("mithral")).toBe("2,001 gp");
  });

  test("are each variant's by its note before its amount", () => {
    expect(readVariantAmounts("lesser (16,012 gp), normal (75,312 gp)")).toEqual(
      new Map([
        ["lesser", "16,012 gp"],
        ["normal", "75,312 gp"],
      ]),
    );
  });

  test("are none for a line of one amount", () => {
    expect(readVariantAmounts("35 gp").size).toBe(0);
  });
});
