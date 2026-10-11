import { describe, expect, test } from "bun:test";

import { DndToolsPage } from "@/codegen/dnd3.5/tools/scraper/pages/DndToolsPage.ts";

/** A page of these headings, then a benefit. */
function page(...headings: string[]) {
  return `<html><body>${headings.map((h) => `<h2>${h}</h2>`).join("")}<h4>Benefit</h4><p>You gain a bonus.</p></body></html>`;
}

/** The title of a page of `headings`, whose frame adds `frame`. */
function titleOf(headings: string[], ...frame: string[]) {
  return new DndToolsPage(page(...headings), ...frame).title();
}

describe("A page's title", () => {
  test("is its first short heading outside the site's frame", () => {
    expect(titleOf(["D&D Tools: the tagline", "Power Attack"])).toBe("Power Attack");
  });

  test("is its second heading when no heading is short and outside the frame", () => {
    const long = "A".repeat(61);
    expect(titleOf(["Welcome", long])).toBe(long);
  });

  test("is none on a page carrying only the site's heading", () => {
    expect(titleOf(["D&D Tools"])).toBe("");
  });

  test("skips the headings a page's frame adds, matched literally, and is trimmed", () => {
    expect(titleOf(["Races", "Elf"])).toBe("Races");
    expect(titleOf(["Races", "Elf"], "Races")).toBe("Elf");
    expect(titleOf(["D&D Tools", "  Power Attack  "])).toBe("Power Attack");
    expect(titleOf(["AxB", "Elf"], "A.B")).toBe("AxB");
    expect(titleOf(["A.B", "Elf"], "A.B")).toBe("Elf");
  });
});
