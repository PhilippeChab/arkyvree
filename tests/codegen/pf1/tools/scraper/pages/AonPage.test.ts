import { describe, expect, test } from "bun:test";

import { AonPage } from "@/codegen/pf1/tools/scraper/pages/AonPage.ts";
import { fixture } from "@/tests/support/pf1/scrapedPages.ts";

/** A page of the site holding `content` as its entry, in its main column. */
function pageOf(content: string): AonPage {
  return new AonPage(
    `<html><body><div id="header"><h1>Archives</h1></div><div id="main">${content}</div></body></html>`,
  );
}

describe("A page of the Archives of Nethys", () => {
  test("is its entry's parts by heading, from its title, its own up to another book's material", () => {
    const page = pageOf(
      '<h1 class="title">Entry</h1>Intro<h3 class="framing">Stats</h3>A<h2 class="title">Own</h2>B' +
        '<h2 class="title">Mythic Entry</h2><b>Source</b> <i>Mythic Adventures pg. 1</i><br />C',
    );
    expect(page.title()).toBe("Entry");
    expect(page.parts().map(({ heading, level }) => [heading, level])).toEqual([
      ["Entry", 1],
      ["Stats", 3],
      ["Own", 2],
      ["Mythic Entry", 2],
    ]);
    expect(page.ownParts().map(({ heading }) => heading)).toEqual(["Entry", "Stats", "Own"]);
  });

  test("has no entry when its main column has no title", () => {
    expect(pageOf("<p>Nothing here</p>").parts()).toEqual([]);
    expect(pageOf("<p>Nothing here</p>").title()).toBe("");
  });

  test("names the books its entry is printed in, and their pages, in its Source line's order", () => {
    expect(new AonPage(fixture("race-dwarf")).sources()).toEqual([
      { book: "Inner Sea Races", page: 236 },
      { book: "PRPG Core Rulebook", page: 21 },
      { book: "Advanced Race Guide", page: 10 },
    ]);
  });

  test("reads a stat block's inline fields, each up to the next label, a semicolon or its line's end", () => {
    const html =
      "<b>Cost</b> 15 gp <b>Weight</b> 4 lbs.<br /><b>Critical</b> 19-20/x2; <b>Range</b> &mdash;; <b>Type</b> S";
    expect(AonPage.fields(html)).toEqual({
      Cost: "15 gp",
      Weight: "4 lbs.",
      Critical: "19-20/x2",
      Range: "",
      Type: "S",
    });
  });

  test("reads labelled paragraphs, a label opening each and the lines after it carrying it on, after an intro", () => {
    const html =
      "Flavor.<br /><br /><b>Benefit</b>: First.<br /><br />Second.<br /><b>Special:</b> Third.<br /><i>Arc (Sp)</i>: Fourth.";
    expect(AonPage.labeled(html)).toEqual({
      intro: "Flavor.",
      entries: [
        { label: "Benefit", text: "First. Second." },
        { label: "Special", text: "Third. Arc (Sp): Fourth." },
      ],
    });
    expect(AonPage.labeled(html, true).entries.at(-1)).toEqual({ label: "Arc (Sp)", text: "Fourth." });
  });

  test("reads a table's columns after the group an upper header row spans them with, and its rows", () => {
    const html =
      '<table><tr><td colspan="2">&nbsp;</td><td colspan="2"><b>Spells Per Day</b></td></tr>' +
      "<tr><td><b>Level</b></td><td><b>Special</b></td><td><b>0</b></td><td><b>1st</b></td></tr>" +
      "<tr><td>1st</td><td>Cantrips</td><td>3</td><td>1</td></tr></table>";
    expect(AonPage.tables(html)).toEqual([
      {
        columns: ["Level", "Special", "Spells Per Day 0", "Spells Per Day 1st"],
        rows: [["1st", "Cantrips", "3", "1"]],
      },
    ]);
  });

  test("leaves out the site's own notes, which aren't the entry's book's", () => {
    const page = pageOf(
      '<h1 class="title">Helper</h1><b>Source</b> <i>Book pg. 1</i><br />' +
        "<b>From Nethys</b>: This entry was not given a description.<br /><b>Hit Die</b>: d6.",
    );
    expect(AonPage.labeled(page.titlePart()).entries).toEqual([{ label: "Hit Die", text: "d6." }]);
    const item = pageOf(
      '<h1 class="title">Oar</h1><b>Source</b> <i>Book pg. 1</i><br /><b>Price</b> 2 gp' +
        '<h3 class="framing">Description</h3><b><i>From Nethys</b>: No description was provided.</i></span>',
    );
    expect(AonPage.textOf(item.parts()[1].html)).toBe("");
  });
});
