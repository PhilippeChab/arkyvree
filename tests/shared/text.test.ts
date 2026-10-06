import { describe, expect, test } from "bun:test";

import { isOneOf } from "@/shared/isOneOf.ts";
import { isRecord } from "@/shared/isRecord.ts";
import { capitalize, getInitial, sanitizeEmail, sanitizeText, stripSeparators } from "@/shared/text.ts";

describe("Text", () => {
  test("is capitalized by its first letter only", () => {
    expect(capitalize("medium load")).toBe("Medium load");
    expect(capitalize("iOS")).toBe("IOS");
    expect(capitalize("")).toBe("");
  });

  test("is stored trimmed and Unicode-normalized, an email address lowercased too", () => {
    expect(sanitizeText("  ﬁre\u00A0ball  ")).toBe("fire ball");
    expect(sanitizeEmail(" Elara@Example.COM ")).toBe("elara@example.com");
  });

  test("gives a name's initial for an avatar", () => {
    expect(getInitial("elara")).toBe("E");
    expect(getInitial("")).toBe("");
  });

  test("is a slug of its letters and digits, lowercased", () => {
    expect(stripSeparators("Weapon Focus: Longsword")).toBe("weaponfocuslongsword");
    expect(stripSeparators("Knowledge (the planes)")).toBe("knowledgetheplanes");
    expect(stripSeparators("Two-Bladed Sword +1")).toBe("twobladedsword1");
  });
});

describe("A value", () => {
  test("is one of a fixed set of texts or numbers, compared exactly", () => {
    expect(isOneOf("Large", ["Small", "Large"])).toBe(true);
    expect(isOneOf("large", ["Small", "Large"])).toBe(false);
    expect(isOneOf(8, [4, 6, 8])).toBe(true);
    expect(isOneOf("8", [4, 6, 8])).toBe(false);
    expect(isOneOf(null, ["Small"])).toBe(false);
    expect(isOneOf(undefined, [4])).toBe(false);
  });

  test("is a record when it's an object whose keys can be read, not an array or null", () => {
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord({})).toBe(true);
    for (const other of [[], null, undefined, "text", 1, true]) expect(isRecord(other)).toBe(false);
  });
});
