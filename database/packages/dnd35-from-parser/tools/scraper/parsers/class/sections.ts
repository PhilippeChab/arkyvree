/** The sections of a class page (dndtools.net): an <h3> or <h4> header, and the text after it. */

import type * as cheerio from "cheerio";
import { type AnyNode } from "domhandler";

import { sectionElements, tagOf } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/page.ts";

/** Find a section header (h3 or h4) whose text matches a pattern */
export function findSectionHeader($: cheerio.CheerioAPI, pattern: RegExp): cheerio.Cheerio<AnyNode> {
  // Try h3 first, then h4
  const h3 = $("h3")
    .filter((_, el) => pattern.test($(el).text().trim()))
    .first();
  if (h3.length > 0) return h3;
  return $("h4")
    .filter((_, el) => pattern.test($(el).text().trim()))
    .first();
}

/** Get the text content after a header, from the next sibling(s) until the next header */
export function getTextAfterHeader(header: cheerio.Cheerio<AnyNode>): string {
  const parts: string[] = [];
  for (const el of sectionElements(header, ["h2", "h3", "h4"])) {
    const text = el.text().trim();
    if (text) parts.push(text);
    const tag = tagOf(el);
    if (tag === "p" || tag === "div") break;
  }
  // If no sibling had content, try parent's text after the header
  if (parts.length === 0) {
    const parent = header.parent();
    if (parent.length > 0) {
      const fullText = parent.text();
      const headerText = header.text().trim();
      const idx = fullText.indexOf(headerText);
      if (idx >= 0) {
        const after = fullText.substring(idx + headerText.length).trim();
        const firstLine = after.split("\n")[0].trim();
        if (firstLine) return firstLine;
      }
    }
  }
  return parts.join(" ");
}
