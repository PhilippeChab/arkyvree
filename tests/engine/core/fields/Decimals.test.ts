import { describe, expect, test } from "bun:test";

import { Decimals } from "@/engine/core/fields/index.ts";

describe("Decimals.toPlaces", () => {
  test.each([
    [2.4, 0, 2],
    [2.5, 0, 3],
    [12, 0, 12],
    [1.004, 2, 1],
    [0.125, 2, 0.13],
    // As its shortest text reads it, though the double it holds is a hair under 1.005
    [1.005, 2, 1.01],
    [3.2, 2, 3.2],
    [1.0004, 3, 1],
    [1.0005, 3, 1.001],
    [2.3456, 3, 2.346],
  ])("keeps %d to %d places, half away from zero: %d", (value, places, kept) => {
    expect(Decimals.toPlaces(value, places)).toBe(kept);
  });

  test.each([
    [-2.5, 0, -3],
    [-0.125, 2, -0.13],
    [-1.005, 2, -1.01],
    [-2.3455, 3, -2.346],
  ])("rounds a negative %d to %d places away from zero, as its positive: %d", (value, places, kept) => {
    expect(Decimals.toPlaces(value, places)).toBe(kept);
    expect(Decimals.toPlaces(-value, places)).toBe(-kept);
  });

  test.each([
    [-0.4, 0],
    [-0.004, 2],
    [-0.0004, 3],
  ])("keeps a negative %d that rounds to none to %d places as 0, never -0", (value, places) => {
    expect(Object.is(Decimals.toPlaces(value, places), 0)).toBe(true);
  });

  test.each([0, 2, 3])("writes 1e21 out whole to %d places, never in exponent form", (places) => {
    expect(Decimals.toPlaces(1e21, places)).toBe(1e21);
    expect(Decimals.toPlaces(-1e21, places)).toBe(-1e21);
    expect(Decimals.toPlaces(1.5e21, places)).toBe(1.5e21);
  });

  test("reads a decimal too small to reach a place as 0", () => {
    expect(Decimals.toPlaces(1e-7, 2)).toBe(0);
  });
});
