import { describe, expect, test } from "bun:test";

import { keepsScroll, KEPT_SCROLL } from "@/client/src/lib/keptScroll.ts";

describe("a navigation that keeps the page's scroll", () => {
  test("is one whose router state says so", () => {
    expect(keepsScroll(KEPT_SCROLL)).toBe(true);
    expect(keepsScroll({ from: "/rulesets/R/classes", copiedFrom: "source", ...KEPT_SCROLL })).toBe(true);
  });

  test.each([undefined, null, "keepScroll", { from: "/rulesets/R/classes" }, { keepScroll: "true" }])(
    "is no other: %p",
    (state) => {
      expect(keepsScroll(state)).toBe(false);
    },
  );
});
