import { describe, expect, test } from "bun:test";

import LiteralValue from "@/engine/core/paths/LiteralValue.ts";

describe("LiteralValue.parse", () => {
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
    expect(LiteralValue.parse(value, valueType)).toBe(expected);
  });
});

describe("LiteralValue.hasType", () => {
  test.each([
    ["Fire", "string", true],
    [3, "string", false],
    [["Verbal", "Somatic"], "string", true],
    [["Verbal", 3], "string", false],
    [[], "string", true],
    [{ misc: 1 }, "string", false],
  ] as const)("%p has the type %s, or each of its values does: %p", (data, valueType, expected) => {
    expect(LiteralValue.hasType(data, valueType)).toBe(expected);
  });
});
