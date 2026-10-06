/** The structure dndtools.net pages share. */

import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import { buildFrameHeading } from "./frame.ts";

const FRAME_HEADING = buildFrameHeading();

/**
 * A page's title heading: its first short h2 outside the site's frame (`frame`), else its second h2. None when it
 * has neither, so a page carrying only the site's heading isn't read as an entry.
 */
export function findContentHeading($: cheerio.CheerioAPI, frame = FRAME_HEADING) {
  const h2s = $("h2").toArray();
  const title =
    h2s.find((el) => {
      const text = $(el).text().trim();
      return text && !frame.test(text) && text.length <= 60;
    }) ?? h2s[1];
  return title ? $(title) : undefined;
}

/** The elements after `start` (its section), up to the next one whose tag is among `stops`: an h2 or h3 by default. */
export function findSectionElements(start: cheerio.Cheerio<AnyNode>, stops = ["h2", "h3"]): cheerio.Cheerio<AnyNode>[] {
  const elements: cheerio.Cheerio<AnyNode>[] = [];
  for (let el = start.next(); el.length > 0 && !stops.includes(getTagName(el) ?? ""); el = el.next()) elements.push(el);
  return elements;
}

/** A page's title: its content heading's text (`findContentHeading`), or "" for a page without one. */
export function getPageTitle($: cheerio.CheerioAPI, frame = FRAME_HEADING): string {
  return findContentHeading($, frame)?.text().trim() ?? "";
}

/** An element's tag name, lowercased. */
export function getTagName(el: cheerio.Cheerio<AnyNode>): string | undefined {
  return el.prop("tagName")?.toLowerCase();
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
