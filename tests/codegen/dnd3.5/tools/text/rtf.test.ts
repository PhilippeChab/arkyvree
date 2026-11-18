import { describe, expect, test } from "bun:test";

import { readRtfText } from "@/codegen/dnd3.5/tools/text/rtf.ts";

describe("readRtfText", () => {
  test("reads a document's paragraphs a line each, its table's cells by tabs, its fonts and styles left out", () => {
    const rtf =
      String.raw`{\rtf1\ansi{\fonttbl{\f0\froman Times New Roman;}}{\*\generator Word;}` +
      String.raw`\pard\b ARMOR SKIN [EPIC]\b0\par Benefit: The character\rquote s natural armor\emdash +1.\par ` +
      String.raw`\trowd 21st\cell Trap sense +7\cell\row }`;
    expect(readRtfText(rtf)).toBe("ARMOR SKIN [EPIC]\nBenefit: The character's natural armor—+1.\n21st\tTrap sense +7");
  });

  test("reads a hex escape as its Windows-1252 character, and an escaped brace as itself", () => {
    expect(readRtfText(String.raw`{\rtf1 caf\'e9 \{x\}\par}`)).toBe("café {x}");
  });
});
