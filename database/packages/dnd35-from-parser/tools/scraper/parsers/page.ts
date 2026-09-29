import * as cheerio from "cheerio";

// The structure dndtools.net pages share.

/** Headings of the site's frame (its tagline, its navigation), not of a page's content. */
const FRAME_HEADING = /^(Feats|Races|D&D|Welcome|Home|About|Search|Login)/i;

/** A page's title: its first short h2 outside the site's frame; else its second h2, or its only one. */
export function contentHeading($: cheerio.CheerioAPI) {
  const h2s = $("h2").toArray();
  const title = h2s.find((el) => {
    const text = $(el).text().trim();
    return text && !FRAME_HEADING.test(text) && text.length <= 60;
  });
  return $(title ?? h2s[1] ?? h2s[0] ?? []);
}

/** A listing page's entries: the first link of each table row that leads into `section` ("feats", "spells"…). */
export function parseListingHtml(html: string, section: string): { name: string; url: string }[] {
  const $ = cheerio.load(html);
  const results: { name: string; url: string }[] = [];
  $("table tr").each((_, row) => {
    const link = $(row).find("td").first().find("a").first();
    const name = link.text().trim();
    const href = link.attr("href");
    if (name && href?.includes(`/${section}/`)) results.push({ name, url: href });
  });
  return results;
}
