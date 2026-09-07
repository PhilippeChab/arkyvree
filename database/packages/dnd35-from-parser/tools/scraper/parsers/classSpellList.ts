import * as cheerio from "cheerio";

// ---------------------------------------------------------------------------
// Class Spell List HTML Parser
// ---------------------------------------------------------------------------
//
// PURPOSE: Parses class-specific spell list pages to extract which spells
// belong to a prestige class at which levels.
//
// dndtools.net structure:
//   Class detail page has links: /classes/{book}/{class}/spells-level-{N}/
//   Each level page lists spells in a table with columns:
//     Spell name, School, Rulebook, Effect, Duration, Range, Components, Casting Time
//
// Legacy (srd.dndtools.org):
//   <h5>1ST-LEVEL ASSASSIN SPELLS</h5>
//   <table class="sortable">
//     <tr><td>Core</td><td><a href="...">Spell Name</a>:</td><td>...</td></tr>
//   </table>
// ---------------------------------------------------------------------------

export type ClassSpellListEntry = {
  name: string;
  level: number;
};

// ---------------------------------------------------------------------------
// dndtools.net: extract spell level page URLs from a class detail page
// ---------------------------------------------------------------------------

/**
 * Parse a class detail page to extract spell level page URLs.
 * Returns URLs like /classes/{book}/{class}/spells-level-0/, etc.
 */
export function parseSpellLevelLinks(html: string): { level: number; url: string }[] {
  const $ = cheerio.load(html);
  const results: { level: number; url: string }[] = [];

  $("a[href*='spells-level-']").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const match = href.match(/spells-level-(\d+)\/?$/);
    if (match) {
      results.push({ level: parseInt(match[1], 10), url: href });
    }
  });

  return results.sort((a, b) => a.level - b.level);
}

// ---------------------------------------------------------------------------
// dndtools.net: parse a single spell level page
// ---------------------------------------------------------------------------

/**
 * Parse a spell level page to extract spell names.
 * The level is passed in since the page itself doesn't always show it clearly.
 */
export function parseSpellLevelPageHtml(html: string, level: number): ClassSpellListEntry[] {
  const $ = cheerio.load(html);
  const spells: ClassSpellListEntry[] = [];

  $("table tr").each((_, row) => {
    const firstCell = $(row).find("td").first();
    if (firstCell.length === 0) return;

    const link = firstCell.find("a").first();
    if (link.length === 0) return;

    let name = link.text().trim();
    if (!name) return;

    // Clean up name
    name = name.replace(/:$/, "").replace(/\u2019/g, "'").trim();

    if (name && level >= 0 && level <= 9) {
      spells.push({ name, level });
    }
  });

  return spells;
}

// ---------------------------------------------------------------------------
// Legacy: parse old srd.dndtools.org single-page format
// ---------------------------------------------------------------------------

export function parseClassSpellListHtml(
  html: string,
): ClassSpellListEntry[] {
  const $ = cheerio.load(html);
  const spells: ClassSpellListEntry[] = [];

  const h5s = $("h5").toArray();

  for (const h5El of h5s) {
    const h5 = $(h5El);
    const text = h5.text().trim();

    const levelMatch = text.match(/^(\d+)(?:ST|ND|RD|TH)-LEVEL\s+/i);
    if (!levelMatch) continue;
    const level = parseInt(levelMatch[1], 10);

    let el = h5.next();
    while (el.length && !el.is("table") && !el.is("h5")) {
      el = el.next();
    }
    if (!el.is("table")) continue;

    el.find("tr").each((_, tr) => {
      const tds = $(tr).find("td");
      if (tds.length < 2) return;

      const source = $(tds[0]).text().trim();
      if (source !== "Core") return;

      const nameTd = $(tds[1]);
      const link = nameTd.find("a").first();
      let name = (link.length ? link.text() : nameTd.text()).trim();
      name = name.replace(/:$/, "").trim();
      name = name.replace(/\u2019/g, "'");

      if (name && level >= 1 && level <= 9) {
        spells.push({ name, level });
      }
    });
  }

  return spells;
}
