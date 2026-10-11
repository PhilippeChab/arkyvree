import { describe, expect, test } from "bun:test";

import { valuesEqual } from "@/client/src/components/common/valuesEqual.ts";

describe("Form values compared for changes", () => {
  test("treat an empty field, null and undefined as the same", () => {
    expect([
      valuesEqual("", undefined),
      valuesEqual(null, ""),
      valuesEqual({ a: "" }, {}),
      valuesEqual(undefined, { a: null }),
    ]).toEqual([true, true, true, true]);
  });

  test("compare arrays and objects in depth", () => {
    expect(valuesEqual({ a: [1, { b: "x" }] }, { a: [1, { b: "x" }] })).toBe(true);
    expect([
      valuesEqual([1, 2], [1, 2, 3]),
      valuesEqual({ a: { b: 1 } }, { a: { b: 2 } }),
      valuesEqual([1], { 0: 1 }),
      valuesEqual(0, ""),
    ]).toEqual([false, false, false, false]);
  });
});
