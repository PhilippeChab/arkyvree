import { describe, expect, test } from "bun:test";

import { parseLiteralValue } from "@/server/rulesets/universal/literalValue.ts";

describe("parseLiteralValue", () => {
  test.each([
    ["true", "boolean", true],
    ["false", "boolean", false],
    ["yes", "boolean", undefined],
    ["", "boolean", undefined],
    ["3", "number", 3],
    ["-1.5", "number", -1.5],
    ["", "number", undefined],
    ["abc", "number", undefined],
    ["Infinity", "number", undefined],
    ["Longsword", "string", "Longsword"],
    ["", "string", ""],
    ["1", "date", undefined],
    ["1", null, undefined],
  ] as const)("reads %p as a %s: %p", (value, valueType, expected) => {
    expect(parseLiteralValue(value, valueType)).toBe(expected);
  });
});
