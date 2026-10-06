/** The entries of dndtools.net's listings. */

import { BASE_URL } from "@/database/packages/dnd35-from-parser/tools/scraper/books.ts";
import { fetchAllPages } from "@/database/packages/dnd35-from-parser/tools/scraper/http.ts";
import { parseListingHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/page.ts";

/** A listing's entries across its pages, with absolute URLs: only `bookSlug`'s, when given. */
export async function discover(listingUrl: string, section: string, bookSlug?: string) {
  const entries: { name: string; url: string }[] = [];
  for (const pageHtml of await fetchAllPages(listingUrl)) {
    for (const { name, url } of parseListingHtml(pageHtml, section)) {
      if (bookSlug && !url.includes(`/${bookSlug}/`)) continue;
      entries.push({ name, url: url.startsWith("http") ? url : `${BASE_URL}${url}` });
    }
  }
  return entries;
}
