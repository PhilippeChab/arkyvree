/** A page of dndtools.net: its content inside the site's frame (its tagline, its navigation). */

import type * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import { Page } from "./Page.ts";

/** The headings of dndtools.net's frame, which every page carries above its content: they start with one of these. */
const SITE_FRAME = ["Feats", "D&D", "Welcome", "Home", "About", "Search", "Login"];

/**
 * A page of dndtools.net: what it says inside the site's frame, its title first. A page whose frame adds its own
 * headings (a race's "Races") names them (`frame`).
 */
export class DndToolsPage extends Page {
  constructor(html: string, ...frame: string[]) {
    super(html);
    this.frame = new RegExp(`^(${[...SITE_FRAME, ...frame].map(RegExp.escape).join("|")})`, "i");
  }

  /** Matches the headings of the site's frame, and the page's own frame's. */
  private readonly frame: RegExp;

  /**
   * The page's title heading: its first short h2 outside the frame, else its second h2. None when it has neither, so
   * a page carrying only the site's heading isn't read as an entry.
   */
  protected contentHeading(): cheerio.Cheerio<AnyNode> | undefined {
    const h2s = this.$("h2").toArray();
    const title =
      h2s.find((el) => {
        const text = this.$(el).text().trim();
        return text && !this.frame.test(text) && text.length <= 60;
      }) ?? h2s[1];
    return title ? this.$(title) : undefined;
  }

  /** The page's title: its content heading's text (`contentHeading`), or "" for a page without one. */
  title(): string {
    return this.contentHeading()?.text().trim() ?? "";
  }
}
