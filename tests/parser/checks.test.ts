import { describe, expect, test } from "bun:test";

import { checkedValue, checkOneOf } from "@/database/packages/dnd35-from-parser/tools/checks.ts";
import { isOneOf } from "@/shared/isOneOf.ts";

describe("A value of a fixed set", () => {
  test("is one of its options, or refused with what it is", () => {
    expect(isOneOf("Medium", ["Small", "Medium"])).toBe(true);
    expect(isOneOf("medium", ["Small", "Medium"])).toBe(false);
    expect(isOneOf(undefined, ["Small", "Medium"])).toBe(false);
    expect(checkOneOf("Small", ["Small", "Medium"], "Elf's size")).toEqual({ ok: true, value: "Small" });
    const titanic = checkOneOf("Titanic", ["Small", "Medium"], "Elf's size");
    expect(titanic).toEqual({ ok: false, problem: `Elf's size: "Titanic" isn't one of Small, Medium` });
    expect(checkedValue(checkOneOf("Small", ["Small"], "Elf's size"))).toBe("Small");
    expect(() => checkedValue(titanic)).toThrow(`Elf's size: "Titanic"`);
  });
});
