import { describe, expect, test } from "bun:test";

import { normalizeText } from "@/codegen/dnd5/tools/detect/text.ts";

describe("A reference's text, as a description takes it", () => {
  test("joins a word the PDF broke over two lines, and keeps a dash before a word a dash runs into", () => {
    expect(normalizeText("your base Ar- mor Class")).toBe("your base Armor Class");
    expect(normalizeText("only one Hamstring Blow at a time- the most recent one")).toBe(
      "only one Hamstring Blow at a time—the most recent one",
    );
  });

  test("keeps a hyphen between capitalized words, and a list's dash", () => {
    expect(normalizeText("a Two- Handed weapon")).toBe("a Two- Handed weapon");
    expect(normalizeText("- Raise the dead")).toBe("- Raise the dead");
  });

  test("leaves the Markdown's emphasis out", () => {
    expect(normalizeText("**Two Cantrips.** You learn two cantrips. A *Spell Scroll* (Cantrip).")).toBe(
      "Two Cantrips. You learn two cantrips. A Spell Scroll (Cantrip).",
    );
  });

  test("leaves its paragraphs' indents and trailing spaces out", () => {
    expect(normalizeText("  First line.  \n  Second line.\n")).toBe("First line.\nSecond line.");
  });
});
