import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

// The structure dndtools.net pages share.

const SITE_FRAME = ["Feats", "D&D", "Welcome", "Home", "About", "Search", "Login"];

/** Matches the headings of the site's frame (its tagline, its navigation) and those starting with one of `extra`. */
export function frameHeading(...extra: string[]): RegExp {
  return new RegExp(`^(${[...SITE_FRAME, ...extra].map(RegExp.escape).join("|")})`, "i");
}

const FRAME_HEADING = frameHeading();

/**
 * A page's title heading: its first short h2 outside the site's frame (`frame`), else its second h2. None when it
 * has neither, so a page carrying only the site's heading isn't read as an entry.
 */
export function contentHeading($: cheerio.CheerioAPI, frame = FRAME_HEADING) {
  const h2s = $("h2").toArray();
  const title =
    h2s.find((el) => {
      const text = $(el).text().trim();
      return text && !frame.test(text) && text.length <= 60;
    }) ?? h2s[1];
  return title ? $(title) : undefined;
}

/** A page's title: its content heading's text (`contentHeading`), or "" for a page without one. */
export function pageTitle($: cheerio.CheerioAPI, frame = FRAME_HEADING): string {
  return contentHeading($, frame)?.text().trim() ?? "";
}

/** A listing page's entries: the first link of each table row that leads into `section` ("feats", "spells"…). */
export function parseListingHtml(html: string, section: string): { name: string; url: string }[] {
  const $ = cheerio.load(html);
  const results: { name: string; url: string }[] = [];
  $("table tr").each((_, row) => {
    const link = $(row).find("td").first().find("a").first();
    const name = link.text().trim();
    const href = link.attr("href");
    if (name && href?.includes(`/${section}/`)) results.push({ name, url: href });
  });
  return results;
}

/** An element's tag name, lowercased. */
export function tagOf(el: cheerio.Cheerio<AnyNode>): string | undefined {
  return el.prop("tagName")?.toLowerCase();
}

/** The elements after `start` (its section), up to the next one whose tag is among `stops`: an h2 or h3 by default. */
export function sectionElements(start: cheerio.Cheerio<AnyNode>, stops = ["h2", "h3"]): cheerio.Cheerio<AnyNode>[] {
  const elements: cheerio.Cheerio<AnyNode>[] = [];
  for (let el = start.next(); el.length > 0 && !stops.includes(tagOf(el) ?? ""); el = el.next()) elements.push(el);
  return elements;
}
