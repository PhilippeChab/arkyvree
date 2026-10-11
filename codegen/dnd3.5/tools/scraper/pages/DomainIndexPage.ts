/**
 * A page of the domain index of dndtools' database, as its copy at dnd.arkalseif.info keeps it: each book's version
 * of a domain its own entry ("Celerity (CD)").
 */

import { Page } from "@/codegen/core/scraper/Page.ts";
import { normalizeWs } from "@/codegen/core/text/whitespace.ts";
import type { DomainIndexEntry } from "@/codegen/dnd3.5/tools/types/domains.ts";

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
