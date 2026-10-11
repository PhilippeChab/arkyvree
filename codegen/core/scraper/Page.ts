/** A scraped page: its HTML, loaded, how its sections and their headings are found, and an element's text read. */

import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import { normalizeWs } from "@/codegen/core/text/whitespace.ts";

/**
 * A scraped page, whatever its site: its document, which a page's readings read (`$`), how they find a section
 * (`section`) and its heading (`heading`), and an element's text, its lines kept apart (`text`).
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

  /**
   * An element's text, each line break (`<br>`) in it a newline: cheerio's `text()` drops it, which joins the lines it
   * splits ("tortured spirits.One side of the wall").
   */
  static text(el: cheerio.Cheerio<AnyNode>): string {
    const copy = el.clone();
    copy.find("br").replaceWith("\n");
    return copy.text();
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
