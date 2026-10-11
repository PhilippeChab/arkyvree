import { describe, expect, test } from "bun:test";

import { defaultValueForPath } from "@/client/src/components/customization/pathValues.ts";

const SIZES = [
  { value: "Small", label: "Small" },
  { value: "Medium", label: "Medium" },
];

describe("a condition's value, as its path is picked", () => {
  test("starts on the path's first choice, True for a boolean, and empty for a number or a text, typed", () => {
    expect(defaultValueForPath("string", SIZES)).toBe("Small");
    expect(defaultValueForPath("boolean", undefined)).toBe("true");
    // A "0" would take the digits typed after it: "02"
    expect(defaultValueForPath("number", undefined)).toBe("");
    expect(defaultValueForPath("string", undefined)).toBe("");
  });
});
