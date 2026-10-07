/** A scraped page: its HTML, loaded, and how its sections and their headings are found. */

import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import { normalizeWs } from "@/database/packages/dnd35-from-parser/tools/text/scrapedText.ts";

/**
 * A scraped page, whatever its site: its document, which a page's readings read (`$`), and how they find a section
 * (`section`) and its heading (`heading`).
 */
export class Page {
  constructor(html: string) {
    this.$ = cheerio.load(html);
  }

  /** The elements after `start` (its section), up to the next one whose tag is among `stops`: an h2 or h3 by default. */
  static section(start: cheerio.Cheerio<AnyNode>, stops = ["h2", "h3"]): cheerio.Cheerio<AnyNode>[] {
    const elements: cheerio.Cheerio<AnyNode>[] = [];
    for (let el = start.next(); el.length > 0 && !stops.includes(Page.tagName(el) ?? ""); el = el.next())
      elements.push(el);
    return elements;
  }

  /** An element's tag name, lowercased. */
  static tagName(el: cheerio.Cheerio<AnyNode>): string | undefined {
    return el.prop("tagName")?.toLowerCase();
  }

  /** The page's document. */
  protected readonly $: cheerio.CheerioAPI;

  /**
   * The first heading among `tags`, in their order (every h3 before any h4), whose text, its whitespace collapsed,
   * matches `pattern`.
   */
  protected heading(pattern: RegExp, tags = ["h3", "h4"]): cheerio.Cheerio<AnyNode> {
    for (const tag of tags) {
      const heading = this.$(tag)
        .filter((_, el) => pattern.test(normalizeWs(this.$(el).text())))
        .first();
      if (heading.length > 0) return heading;
    }
    return this.$([]);
  }
}
