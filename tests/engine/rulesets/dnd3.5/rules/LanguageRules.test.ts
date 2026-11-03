import { describe, expect, test } from "bun:test";

import LanguageRules from "@/engine/rulesets/dnd3.5/rules/LanguageRules.ts";

describe("the room a character's picked languages take", () => {
  test("is a pick per point of its Intelligence modifier, none below, per whole rank, and per extra pick", () => {
    expect(LanguageRules.roomOf(2, 0, 0)).toBe(2);
    expect(LanguageRules.roomOf(0, 3, 0)).toBe(3);
    expect(LanguageRules.roomOf(0, 0, 1)).toBe(1);
    expect(LanguageRules.roomOf(2, 3, 1)).toBe(6);
    expect(LanguageRules.roomOf(-1, 2, 0)).toBe(2);
    // A cross-class rank is bought half at a time: half a rank adds no language
    expect(LanguageRules.roomOf(0, 1.5, 0)).toBe(1);
    // A modifier that takes picks away leaves none below 0
    expect(LanguageRules.roomOf(1, 0, -2)).toBe(0);
  });
});

describe("a secret language", () => {
  test("is one whose type says so, however it's cased", () => {
    expect(LanguageRules.isSecret("Secret")).toBe(true);
    expect(LanguageRules.isSecret("secret")).toBe(true);
    expect(LanguageRules.isSecret("Exotic")).toBe(false);
  });
});
