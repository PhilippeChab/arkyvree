import * as cheerio from "cheerio";

import { normalizeWs } from "@/database/packages/dnd35-from-parser/tools/shared.ts";

// The domains of dndtools' database as its copy at dnd.arkalseif.info keeps them: each book's version of a domain its
// own page ("Celerity (CD)": its book and page, its granted power, its spells), and each spell's page the level it has
// in each version. dndtools.net itself has since merged a domain's versions, without their books or spell levels.

/** A domain version of the domain index: its page's slug ("celerity-cd") and its label ("Celerity (CD)"). */
export type DomainIndexEntry = { slug: string; label: string };

/** A spell a domain's page lists: its page (`<book>/<spell>`), its name and its edition ("Core (3.5)"). */
export type DomainPageSpell = { path: string; name: string; edition: string };

/** A domain version's page: its book (the rulebook's slug, "complete-divine--56") and page, its granted power, its spells. */
export type DomainPage = {
  label: string;
  bookSlug?: string;
  page?: number;
  description: string;
  spells: DomainPageSpell[];
};

/** A domain's name without its version's book ("Celerity (CD)" → "Celerity"). */
export const domainName = (label: string) => label.replace(/\s*\([^()]*\)$/, "").trim();

/** The book's code a domain version's label ends with ("Celerity (CD)" → "CD"), if any. */
export const domainBookCode = (label: string) => label.match(/\(([^()]+)\)$/)?.[1];

/** The domain versions a page of the domain index lists, and how many entries the index holds in all. */
export function parseDomainIndexHtml(html: string): { entries: DomainIndexEntry[]; total: number } {
  const $ = cheerio.load(html);
  const entries: DomainIndexEntry[] = [];
  $("table.common td a").each((_, el) => {
    const slug = $(el)
      .attr("href")
      ?.match(/^([^/]+)\/index\.html$/)?.[1];
    if (slug) entries.push({ slug, label: normalizeWs($(el).text()) });
  });
  const total = Number(
    $("body")
      .text()
      .match(/\(total (\d+) items\)/)?.[1] ?? entries.length,
  );
  return { entries, total };
}

/** A domain version's page: its heading, the rulebook it links to, its granted power and its spells' table. */
export function parseDomainPageHtml(html: string): DomainPage {
  const $ = cheerio.load(html);
  const heading = $("#content h2").first();
  const source = heading.next("p");
  const rulebook = source.find('a[href*="/rulebooks/"]').attr("href");
  const page = source.text().match(/p\.\s*(\d+)/)?.[1];

  const grantedHeading = $("#content h4").filter((_, el) => /^granted power/i.test($(el).text().trim()));
  const description = normalizeWs(grantedHeading.next(".nice-textile").text());

  const spells: DomainPageSpell[] = [];
  $("#content table tr").each((_, row) => {
    const cells = $(row).find("td");
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

/** The domain versions a spell's page gives it a level in: each version's page slug, with the level. */
export function parseSpellDomainLevelsHtml(html: string): Map<string, number> {
  const $ = cheerio.load(html);
  const levels = new Map<string, number>();
  $('#content a[href*="/domains/"]').each((_, el) => {
    const slug = $(el)
      .attr("href")
      ?.match(/\/domains\/([^/]+)\/index\.html$/)?.[1];
    const next = el.nextSibling;
    const level = next?.type === "text" ? next.data.match(/^\s*(\d+)/)?.[1] : undefined;
    if (slug && level !== undefined) levels.set(slug, Number(level));
  });
  return levels;
}
