/** What a class page says of the class first: its name, description, hit die, skill points and alignment. */

import type * as cheerio from "cheerio";

import {
  findSectionHeader,
  getTextAfterHeader,
} from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/class/sections.ts";
import { titleCase } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/class/titleCase.ts";
import {
  contentHeading,
  sectionElements,
  tagOf,
} from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/page.ts";

/** The class's heading: its page's title, or its only h2. */
function classHeading($: cheerio.CheerioAPI) {
  return contentHeading($) ?? $("h2").first();
}

export function parseAlignment($: cheerio.CheerioAPI): string | undefined {
  // dndtools.net: <h3>Requirements</h3> → <p><strong>Alignment:</strong> ...</p>
  const reqHeader = findSectionHeader($, /^Requirements?$/i);
  if (reqHeader.length > 0) {
    for (const el of sectionElements(reqHeader)) {
      const alignMatch = el
        .text()
        .trim()
        .match(/^Alignment:\s*(.+)/i);
      if (alignMatch) return alignMatch[1].trim();
    }
  }

  return undefined;
}

/** The class's name: its page's second <h2> (the first is the site's tagline). */
export function parseClassName($: cheerio.CheerioAPI): string {
  const heading = classHeading($);
  return heading.length > 0 ? titleCase(heading.text().trim()) : "Unknown";
}

/** The class's description: the paragraphs between its name's <h2> and the first <h3>. */
export function parseDescription($: cheerio.CheerioAPI): string {
  const paragraphs: string[] = [];

  // Find the class name h2
  const classH2 = classHeading($);
  if (classH2.length > 0) {
    // Up to any section heading
    for (const el of sectionElements(classH2, ["h2", "h3", "h4"])) {
      const tag = tagOf(el);
      if (tag === "p") {
        const text = el.text().trim();
        // Skip short text, page references, and "all of the following" boilerplate
        if (text && text.length >= 20 && !text.match(/^\(.*p\.\s*\d+\)$/) && !text.match(/^All of the following/i)) {
          paragraphs.push(text);
        }
      }
      // Check inside divs (nice-textile) — but skip if it contains feature headers
      if (tag === "div" && !el.find("h3, h4, strong, b").length) {
        el.find("p").each((_, p) => {
          const text = $(p).text().trim();
          if (text && text.length >= 20) paragraphs.push(text);
        });
      }
    }
  }

  return paragraphs.slice(0, 3).join(" ");
}

/** The class's hit die: the text after its <h3>Hit die</h3>. */
export function parseHitDie($: cheerio.CheerioAPI): string {
  const header = findSectionHeader($, /^Hit die$/i);
  if (header.length > 0) {
    const text = getTextAfterHeader(header);
    const match = text.match(/d(\d+)/i);
    if (match) return `d${match[1]}`;
  }

  // Fallback: regex on body text
  const bodyText = $("body").text();
  const hdMatch = bodyText.match(/Hit\s+Die[:\s]*d(\d+)/i);
  if (hdMatch) return `d${hdMatch[1]}`;

  return "d8";
}

/** The class's skill points: the text after its <h3>Skill points</h3>. */
export function parseSkillPoints($: cheerio.CheerioAPI): string {
  const header = findSectionHeader($, /^Skill points$/i);
  if (header.length > 0) {
    const text = getTextAfterHeader(header);
    const match = text.match(/(\d+)\s*\+\s*Int/i);
    if (match) return `${match[1]} + Int modifier`;
  }

  // Fallback: regex on body text
  const bodyText = $("body").text();
  const spMatch = bodyText.match(/Skill Points?\s+(?:at Each|per)\s+(?:Additional\s+)?Level[:\s]*(\d+)\s*\+/i);
  if (spMatch) return `${spMatch[1]} + Int modifier`;

  return "2 + Int modifier";
}
