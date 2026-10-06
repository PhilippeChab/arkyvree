/** Scrapes a book's domains, from dndtools' database as its copy at dnd.arkalseif.info keeps them. */

import { join } from "node:path";

import { REFERENCE_DIR } from "@/database/packages/dnd35-from-parser/tools/referenceFiles.ts";
import { getBookSlug } from "@/database/packages/dnd35-from-parser/tools/scraper/books.ts";
import { fetchHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/http.ts";
import {
  domainBookCode,
  domainName,
  type DomainPageSpell,
  parseDomainIndexHtml,
  parseDomainPageHtml,
  parseSpellDomainLevelsHtml,
} from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/domain.ts";
import { saveReference } from "@/database/packages/dnd35-from-parser/tools/scraper/saveReference.ts";

/** dndtools' domains as its copy at dnd.arkalseif.info keeps them: a page per book's version (`parsers/domain.ts`). */
const DOMAIN_SITE = "https://dnd.arkalseif.info/spells";

const DOMAIN_INDEX_URL = `${DOMAIN_SITE}/domains/index.html`;

/** A page of the domain index: the copy keeps page N as `index.html?page=N`, its `?` escaped. */
function domainIndexPageUrl(page: number) {
  return page === 1 ? DOMAIN_INDEX_URL : `${DOMAIN_INDEX_URL}%3Fpage=${page}`;
}

/** Every domain version of the index, with its page. */
async function fetchDomainPages() {
  const first = parseDomainIndexHtml(await fetchHtml(domainIndexPageUrl(1)));
  const entries = [...first.entries];
  for (let page = 2; entries.length < first.total; page++) {
    const { entries: more } = parseDomainIndexHtml(await fetchHtml(domainIndexPageUrl(page)));
    if (more.length === 0) break;
    entries.push(...more);
  }
  const pages = [];
  for (const entry of entries) {
    pages.push({
      ...entry,
      ...parseDomainPageHtml(await fetchHtml(`${DOMAIN_SITE}/domains/${entry.slug}/index.html`)),
    });
  }
  return pages;
}

/**
 * A book's domains as it prints them: each version whose page names the book, with its granted power and its 3.5
 * spells at their level there. Its spells are those its page lists and those of the domain's other versions (a page
 * of the copy can miss some), each kept at the level its own page gives this version.
 */
export async function scrapeBookDomains(book: string) {
  const bookSlug = getBookSlug(book);
  const pages = await fetchDomainPages();
  // A version whose page names no book (Glory (CD)'s) is the book's when its label ends with the book's code, the
  // code ("CD") the versions that name the book end with
  const codes = new Set(pages.filter((page) => page.bookSlug === bookSlug).map((page) => domainBookCode(page.label)));
  codes.delete(undefined);
  const versions = pages.filter(
    (page) => page.bookSlug === bookSlug || (!page.bookSlug && codes.has(domainBookCode(page.label))),
  );
  const bookless = pages.filter((page) => !page.bookSlug && !versions.includes(page)).length;
  console.log(`${versions.length} of ${pages.length} domain versions are ${book}'s; ${bookless} others name no book`);

  const raw = [];
  for (const version of versions) {
    const name = domainName(version.label);
    const candidates = new Map<string, DomainPageSpell>();
    for (const page of pages.filter((p) => domainName(p.label) === name)) {
      for (const spell of page.spells) if (spell.edition.includes("3.5")) candidates.set(spell.path, spell);
    }
    const spells = [];
    for (const spell of candidates.values()) {
      const levels = parseSpellDomainLevelsHtml(await fetchHtml(`${DOMAIN_SITE}/${spell.path}/index.html`));
      const level = levels.get(version.slug);
      if (level !== undefined) spells.push({ name: spell.name, level });
    }
    spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    raw.push({ name, ...(version.page ? { page: version.page } : {}), description: version.description, spells });
    console.log(`  ${version.label}: ${spells.length} spells`);
  }
  if (raw.length === 0) {
    console.log(`No domain of ${book}: no reference written`);
    return;
  }

  saveReference(
    join(REFERENCE_DIR, book, "domains.json"),
    { type: "domain", sourceUrl: DOMAIN_INDEX_URL, book, scrapedAt: new Date().toISOString() },
    raw,
  );
}
