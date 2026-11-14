import { describe, expect, test } from "bun:test";

import { defaultValueForPath, knownPathInfo } from "@/client/src/components/customization/pathValues.ts";

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

describe("what a condition's path takes, as its dialog shows it", () => {
  const climb = { path: "skills.climb.misc", valueType: "number" as const, operators: ["add", "set"] };

  test("keeps what its path took once a refresh finds the path no more, its skill renamed elsewhere", () => {
    expect(knownPathInfo(climb, null, "skills.climb.misc")).toBe(climb);
    expect(knownPathInfo(null, climb, "skills.climb.misc")).toBe(climb);
    expect(knownPathInfo(undefined, climb, "skills.climb.misc")).toBe(climb);
  });

  test("takes nothing of another path's: a path typed since takes its own, or none while it's unknown", () => {
    expect(knownPathInfo(null, climb, "skills.jump.misc")).toBeNull();
    expect(knownPathInfo(null, null, "skills.climb.misc")).toBeNull();
  });
});
