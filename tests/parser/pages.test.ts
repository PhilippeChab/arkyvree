import { describe, expect, test } from "bun:test";

import * as cheerio from "cheerio";

import { parseClassHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/class.ts";
import { parseFeatDetailHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/feat.ts";
import { frameHeading } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/frame.ts";
import {
  contentHeading,
  pageTitle,
  parseListingHtml,
  sectionElements,
} from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/page.ts";
import { parseRaceDetailHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/race.ts";
import { parseSpellDetailHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/spell.ts";

function headingOf(html: string, frame?: RegExp) {
  return contentHeading(cheerio.load(html), frame)?.text();
}

function page(...headings: string[]) {
  return `<html><body>${headings.map((h) => `<h2>${h}</h2>`).join("")}<h4>Benefit</h4><p>You gain a bonus.</p></body></html>`;
}

describe("A page's content heading", () => {
  test("is its first short heading outside the site's frame", () => {
    expect(headingOf(page("D&D Tools: the tagline", "Power Attack"))).toBe("Power Attack");
  });

  test("is its second heading when no heading is short and outside the frame", () => {
    const long = "A".repeat(61);
    expect(headingOf(page("Welcome", long))).toBe(long);
  });

  test("is none on a page carrying only the site's heading", () => {
    expect(headingOf(page("D&D Tools"))).toBeUndefined();
  });

  test("skips the headings a page's frame adds", () => {
    expect(headingOf(page("Races", "Elf"))).toBe("Races");
    expect(headingOf(page("Races", "Elf"), frameHeading("Races"))).toBe("Elf");
    expect(parseRaceDetailHtml(page("Races", "Elf"))?.name).toBe("Elf");
  });

  test("gives the page's title, or none", () => {
    expect(pageTitle(cheerio.load(page("D&D Tools", "  Power Attack  ")))).toBe("Power Attack");
    expect(pageTitle(cheerio.load(page("D&D Tools")))).toBe("");
    expect(pageTitle(cheerio.load(page("Races", "Elf")), frameHeading("Races"))).toBe("Elf");
  });

  test("matches a frame heading literally", () => {
    expect(frameHeading("A.B").test("AxB")).toBe(false);
    expect(frameHeading("A.B").test("A.B")).toBe(true);
  });
});

describe("A section", () => {
  test("is what follows its heading, up to the next heading", () => {
    const $ = cheerio.load(
      "<h3>Traits</h3><p>one</p><ul><li>two</li></ul><h4>Sub</h4><p>three</p><h3>Next</h3><p>four</p>",
    );
    const texts = (stops?: string[]) => sectionElements($("h3").first(), stops).map((el) => el.text());
    expect(texts()).toEqual(["one", "two", "Sub", "three"]);
    expect(texts(["h3", "h4"])).toEqual(["one", "two"]);
  });
});

describe("A detail page carrying only the site's heading", () => {
  test("is no feat, spell or race", () => {
    const html = page("D&D Tools");
    expect(parseFeatDetailHtml(html)).toBeNull();
    expect(parseSpellDetailHtml(html, "https://dndtools.net/spells/srd/fireball--1/")).toBeNull();
    expect(parseRaceDetailHtml(html)).toBeNull();
  });

  test("is a class named after that heading", () => {
    expect(parseClassHtml(page("Welcome"), "https://dndtools.net/classes/fighter/", "srd").name).toBe("Welcome");
  });
});

describe("A listing page's entries", () => {
  test("are the first link of each row leading into its section", () => {
    const html = `<table>
      <tr><th>Name</th></tr>
      <tr><td><a href="/feats/srd/power-attack--1/">Power Attack</a></td><td><a href="/rulebooks/srd/">SRD</a></td></tr>
      <tr><td><a href="/spells/srd/fireball--1/">Fireball</a></td></tr>
      <tr><td>No link</td></tr>
    </table>`;
    expect(parseListingHtml(html, "feats")).toEqual([{ name: "Power Attack", url: "/feats/srd/power-attack--1/" }]);
  });
});
