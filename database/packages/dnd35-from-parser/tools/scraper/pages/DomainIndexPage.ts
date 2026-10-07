/**
 * A page of the domain index of dndtools' database, as its copy at dnd.arkalseif.info keeps it: each book's version
 * of a domain its own entry ("Celerity (CD)").
 */

import { normalizeWs } from "@/database/packages/dnd35-from-parser/tools/text/scrapedText.ts";
import type { DomainIndexEntry } from "@/database/packages/dnd35-from-parser/tools/types/domains.ts";

import { Page } from "./Page.ts";

/** A page of the domain index: the domain versions it lists, and how many the index holds in all. */
export class DomainIndexPage extends Page {
  /** The domain versions the page lists, and how many entries the index holds in all (its own when it says none). */
  read(): { entries: DomainIndexEntry[]; total: number } {
    const entries: DomainIndexEntry[] = [];
    this.$("table.common td a").each((_, el) => {
      const slug = this.$(el)
        .attr("href")
        ?.match(/^([^/]+)\/index\.html$/)?.[1];
      if (slug) entries.push({ slug, label: normalizeWs(this.$(el).text()) });
    });
    const total = Number(
      this.$("body")
        .text()
        .match(/\(total (\d+) items\)/)?.[1] ?? entries.length,
    );
    return { entries, total };
  }
}
