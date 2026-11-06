/** A book's page of aonprd.com (`SourceDisplay.aspx`): every entry the book prints, under a heading per kind. */

import { Page } from "@/codegen/core/scraper/Page.ts";
import { normalizeWs } from "@/codegen/core/text/whitespace.ts";

/** An entry a book's page lists: its name and its page's absolute URL. */
export interface ListedEntry {
  name: string;
  url: string;
}

/**
 * A book's page of aonprd.com: its entries under a heading per kind, each heading its count ("Feats [176]"), each
 * entry a link to its page.
 */
export class SourcePage extends Page {
  /** `site`: the site the page's links lead into, which makes them absolute. */
  constructor(
    html: string,
    private readonly site: string,
  ) {
    super(html);
  }

  /**
   * The entries listed under the heading named `heading` ("Feats", "Prestige Classes"), its count aside, in the page's
   * order: none when the book prints none of the kind.
   */
  entries(heading: string): ListedEntry[] {
    const title = this.$("h2.title")
      .filter((_, el) => normalizeWs(this.$(el).text()).replace(/\s*\[\d+\]$/, "") === heading)
      .first();
    if (title.length === 0) return [];
    return title
      .nextUntil("h2")
      .filter("a[href]")
      .toArray()
      .map((link) => ({
        name: normalizeWs(this.$(link).text()),
        url: new URL(this.$(link).attr("href") ?? "", `${this.site}/`).href,
      }));
  }
}
