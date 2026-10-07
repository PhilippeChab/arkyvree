/**
 * A domain version's page of dndtools' database, as its copy at dnd.arkalseif.info keeps it: each book's version of a
 * domain its own page ("Celerity (CD)": its book and page, its granted power, its spells). dndtools.net itself has
 * since merged a domain's versions, without their books or spell levels.
 */

import { normalizeWs } from "@/database/packages/dnd35-from-parser/tools/text/scrapedText.ts";
import type { DomainVersion, DomainVersionSpell } from "@/database/packages/dnd35-from-parser/tools/types/domains.ts";

import { Page } from "./Page.ts";

/** A domain version's page: its heading, the rulebook it links to, its granted power and its spells' table. */
export class DomainPage extends Page {
  /** The book's code a domain version's label ends with ("Celerity (CD)" → "CD"), if any. */
  static bookCodeOf(label: string): string | undefined {
    return label.match(/\(([^()]+)\)$/)?.[1];
  }

  /** A domain's name without its version's book ("Celerity (CD)" → "Celerity"). */
  static nameOf(label: string): string {
    return label.replace(/\s*\([^()]*\)$/, "").trim();
  }

  /** The domain version, as its page gives it. */
  read(): DomainVersion {
    const heading = this.$("#content h2").first();
    const source = heading.next("p");
    const rulebook = source.find('a[href*="/rulebooks/"]').attr("href");
    const page = source.text().match(/p\.\s*(\d+)/)?.[1];

    const grantedHeading = this.$("#content h4").filter((_, el) => /^granted power/i.test(this.$(el).text().trim()));
    const description = normalizeWs(grantedHeading.next(".nice-textile").text());

    const spells: DomainVersionSpell[] = [];
    this.$("#content table tr").each((_, row) => {
      const cells = this.$(row).find("td");
      const link = cells.first().find("a").first();
      const path = link.attr("href")?.match(/^\.\.\/\.\.\/([^/]+\/[^/]+)\/index\.html$/)?.[1];
      if (path) spells.push({ path, name: normalizeWs(link.text()), edition: normalizeWs(cells.last().text()) });
    });

    return {
      label: normalizeWs(heading.text()),
      ...(rulebook ? { bookSlug: rulebook.match(/([^/]+)\/index\.html$/)?.[1] } : {}),
      ...(page ? { page: Number(page) } : {}),
      description,
      spells,
    };
  }
}
