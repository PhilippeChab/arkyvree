/** A listing page of dndtools.net: a table of entries, each a link to its page. */

import { DndToolsPage } from "./DndToolsPage.ts";

/** A listing page of dndtools.net (a book's feats, the classes…): its table's entries. */
export class ListingPage extends DndToolsPage {
  /** The page's entries: the first link of each table row that leads into `section` ("feats", "spells"…). */
  entries(section: string): { name: string; url: string }[] {
    const results: { name: string; url: string }[] = [];
    this.$("table tr").each((_, row) => {
      const link = this.$(row).find("td").first().find("a").first();
      const name = link.text().trim();
      const href = link.attr("href");
      if (name && href?.includes(`/${section}/`)) results.push({ name, url: href });
    });
    return results;
  }
}
