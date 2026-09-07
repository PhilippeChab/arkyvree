import * as cheerio from "cheerio";

// ---------------------------------------------------------------------------
// Domain HTML Parser — dndtools.net structure
//
// Listing page: /spells/domains/
//   <ul><li><a href="/spells/domains/{slug}/">Domain Name</a></li>...</ul>
//
// Detail page: /spells/domains/{slug}/
//   <h2>Domain Name</h2>
//   <h4>Granted power (Su)</h4>
//   <p>Description text...</p>
//   <table> spell listing (no level column — levels resolved by orchestrator)
//
// Note: dndtools.net domain pages do NOT include spell levels. The
// orchestrator resolves levels by cross-referencing individual spell pages
// or existing reference data.
// ---------------------------------------------------------------------------

const CORE_DOMAINS = new Set([
  "Air", "Animal", "Chaos", "Death", "Destruction", "Earth", "Evil", "Fire",
  "Good", "Healing", "Knowledge", "Law", "Luck", "Magic", "Plant", "Protection",
  "Strength", "Sun", "Travel", "Trickery", "War", "Water",
]);

export type DomainRaw = {
  name: string;
  description: string;
  spells: { name: string; slug?: string; level: number }[];
};

// ---------------------------------------------------------------------------
// Listing page parser
// ---------------------------------------------------------------------------

/**
 * Parse the domain listing page to extract domain names and URLs.
 */
export function parseDomainListingHtml(html: string): { name: string; url: string }[] {
  const $ = cheerio.load(html);
  const results: { name: string; url: string }[] = [];

  $("a[href*='/spells/domains/']").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const name = $(el).text().trim();
    // Skip the main listing link itself
    if (!name || href === "/spells/domains/" || !href.match(/\/spells\/domains\/[^/]+\//)) return;
    results.push({ name, url: href });
  });

  return results;
}

// ---------------------------------------------------------------------------
// Detail page parser
// ---------------------------------------------------------------------------

/**
 * Parse a single domain detail page.
 * Returns name, granted power description, and spell names (without levels).
 * Levels must be resolved separately.
 */
export function parseDomainDetailHtml(html: string): {
  name: string;
  description: string;
  spellNames: string[];
} | null {
  const $ = cheerio.load(html);

  const name = findContentH2($);
  if (!name) return null;

  // Granted power — <h4>Granted power...</h4> or <h3> followed by text
  const grantedParts: string[] = [];
  let grantedHeader = $("h4").filter((_, el) =>
    /^Granted power/i.test($(el).text().trim())
  ).first();
  if (grantedHeader.length === 0) {
    grantedHeader = $("h3").filter((_, el) =>
      /^Granted power/i.test($(el).text().trim())
    ).first();
  }

  if (grantedHeader.length > 0) {
    let el = grantedHeader.next();
    while (el.length > 0) {
      const tag = el.prop("tagName")?.toLowerCase();
      if (tag === "h3" || tag === "h4" || tag === "h2" || tag === "table") break;
      if (tag === "p" || tag === "div") {
        const text = el.text().trim();
        if (text) grantedParts.push(text);
      }
      el = el.next();
    }
  }

  const description = grantedParts.join(" ").replace(/\s+/g, " ").trim();

  // Spells from table — extract names from first column links
  const spellNames: string[] = [];
  $("table tr").each((_, row) => {
    const firstCell = $(row).find("td").first();
    if (firstCell.length === 0) return;
    const link = firstCell.find("a").first();
    const spellName = link.length > 0 ? link.text().trim() : "";
    if (spellName) spellNames.push(spellName);
  });

  return { name, description, spellNames };
}

// ---------------------------------------------------------------------------
// Legacy: single-page all-domains parser (old srd.dndtools.org format)
// ---------------------------------------------------------------------------

export function parseDomainsHtml(
  html: string,
  sourceUrl: string,
  book: string,
  filter: "core" | "non-core" | "all" = "core",
): { _meta: { type: "domain"; sourceUrl: string; book: string; filter: "core" | "non-core" | "all"; scrapedAt: string }; raw: DomainRaw[] } {
  const $ = cheerio.load(html);
  const domains: DomainRaw[] = [];

  const h5s = $("h5").toArray();

  for (const h5El of h5s) {
    const h5 = $(h5El);
    const titleText = h5.text().trim();

    // Match "AIR DOMAIN" or standalone planar names like "THE ABYSS", "ARBOREA"
    const nameMatch = titleText.match(/^(.+?)\s+DOMAIN(?:\s*(\(.+\)))?$/i);
    // Skip headers that aren't domains (e.g. "PLANAR DOMAINS")
    if (!nameMatch && titleText.match(/DOMAINS$/i)) continue;

    const rawName = nameMatch ? nameMatch[1] : titleText;
    const suffix = nameMatch?.[2] ?? "";
    const baseName = rawName.split(/\s+/).map((w) =>
      w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    ).join(" ");
    const name = suffix ? `${baseName} ${suffix}` : baseName;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const siblings: cheerio.Cheerio<any>[] = [];
    let el = h5.next();
    while (el.length && !el.is("h5")) {
      if (el.is("a[id]") && el.attr("id")?.endsWith("-domain")) break;
      siblings.push(el);
      el = el.next();
    }

    const grantedParts: string[] = [];
    let seenSpellHeader = false;
    for (const sib of siblings) {
      if (sib.is("h6")) { seenSpellHeader = true; continue; }
      if (seenSpellHeader) continue;
      if (sib.is("p")) {
        let text = sib.text().trim();
        text = text.replace(/^Granted Powers?:\s*/i, "");
        if (text) grantedParts.push(text);
      }
    }
    const description = grantedParts.join(" ").replace(/\s+/g, " ").trim();

    const spells: { name: string; slug?: string; level: number }[] = [];
    const spellSeen = new Set<string>();
    const table = siblings.find((s) => s.is("table"));
    if (table) {
      table.find("tr").each((_, tr) => {
        const tds = $(tr).find("td");
        if (tds.length === 0) return;

        const firstTd = tds.first();
        const firstText = firstTd.text().trim();

        // Format 1: standard — "1 Spell Name: description" in one cell
        const singleCellMatch = firstText.match(/^(\d+)\s+(.+?)[*:]*$/);
        if (singleCellMatch) {
          const level = parseInt(singleCellMatch[1], 10);
          const spellName = singleCellMatch[2].trim()
            .replace(/\s+[MFX]+(\s+[MFX]+)*$/, "");

          const link = firstTd.find("a[href]").first();
          const href = link.attr("href") ?? "";
          const slugMatch = href.match(/#(.+)$/);
          const slug = slugMatch ? slugMatch[1] : undefined;

          const key = `${level}:${spellName}`;
          if (level >= 1 && level <= 9 && spellName && !spellSeen.has(key)) {
            spellSeen.add(key);
            spells.push({ name: normalizeDomainSpellName(spellName), ...(slug ? { slug } : {}), level });
          }
          return;
        }

        // Format 2: planar — level in first <td>, spell links in second <td>
        const levelMatch = firstText.match(/^(\d+)$/);
        if (levelMatch && tds.length >= 2) {
          const level = parseInt(levelMatch[1], 10);
          if (level < 1 || level > 9) return;
          const secondTd = tds.eq(1);
          secondTd.find("a").each((_, a) => {
            const spellName = $(a).text().trim();
            if (!spellName) return;
            const href = $(a).attr("href") ?? "";
            const slugMatch = href.match(/#(.+)$/);
            const slug = slugMatch ? slugMatch[1] : undefined;

            const key = `${level}:${spellName}`;
            if (!spellSeen.has(key)) {
              spellSeen.add(key);
              spells.push({ name: normalizeDomainSpellName(spellName), ...(slug ? { slug } : {}), level });
            }
          });
        }
      });
    }

    const isCore = CORE_DOMAINS.has(name);
    const include =
      filter === "all" ? true :
      filter === "core" ? isCore :
      !isCore;
    if (spells.length > 0 && include) {
      domains.push({ name, description, spells });
    }
  }

  return {
    _meta: {
      type: "domain",
      sourceUrl,
      book,
      filter,
      scrapedAt: new Date().toISOString(),
    },
    raw: domains,
  };
}

// ---------------------------------------------------------------------------
// Spell name normalization (srd.dndtools.org → dndtools.net conventions)
// ---------------------------------------------------------------------------

const NAMED_SPELL_PREFIXES: Record<string, string> = {
  "Grasping Hand": "Bigby's Grasping Hand",
  "Clenched Fist": "Bigby's Clenched Fist",
  "Crushing Hand": "Bigby's Crushing Hand",
  "Interposing Hand": "Bigby's Interposing Hand",
  "Forceful Hand": "Bigby's Forceful Hand",
  "Instant Summons": "Drawmij's Instant Summons",
  "Secret Chest": "Leomund's Secret Chest",
  "Tiny Hut": "Leomund's Tiny Hut",
  "Secure Shelter": "Leomund's Secure Shelter",
  "Trap": "Leomund's Trap",
  "Acid Arrow": "Melf's Acid Arrow",
  "Mage's Disjunction": "Mordenkainen's Disjunction",
  "Faithful Hound": "Mordenkainen's Faithful Hound",
  "Magnificent Mansion": "Mordenkainen's Magnificent Mansion",
  "Private Sanctum": "Mordenkainen's Private Sanctum",
  "Magic Aura": "Nystul's Magic Aura",
  "Irresistible Dance": "Otto's Irresistible Dance",
  "Telepathic Bond": "Rary's Telepathic Bond",
  "Hideous Laughter": "Tasha's Hideous Laughter",
  "Transformation": "Tenser's Transformation",
  "Floating Disk": "Tenser's Floating Disk",
};

export function normalizeDomainSpellName(name: string): string {
  // Normalize Unicode quotes to ASCII
  let normalized = name.replace(/[\u2018\u2019]/g, "'").replace(/[\u2013\u2014]/g, "-");

  // Strip trailing daggers (e.g. "Animal Trance†")
  normalized = normalized.replace(/[†*]+$/, "").trim();

  // Named spell prefixes (e.g. "Grasping Hand" → "Bigby's Grasping Hand")
  if (NAMED_SPELL_PREFIXES[normalized]) return NAMED_SPELL_PREFIXES[normalized];

  // "Greater/Lesser/Mass X" → "X, Greater/Lesser/Mass"
  const prefixMatch = normalized.match(/^(Greater|Lesser|Mass)\s+(.+)$/i);
  if (prefixMatch) {
    const [, prefix, rest] = prefixMatch;
    return `${rest}, ${prefix.charAt(0).toUpperCase() + prefix.slice(1).toLowerCase()}`;
  }

  // "Power Word, X" → "Power Word X" (remove comma)
  normalized = normalized.replace(/^Power Word,\s*/i, "Power Word ");

  return normalized;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Find the content h2, skipping the site tagline */
function findContentH2($: cheerio.CheerioAPI): string {
  const h2s = $("h2").toArray();
  for (const el of h2s) {
    const text = $(el).text().trim();
    if (text.match(/^(Feats|D&D|Welcome|Home|About|Search|Login)/i)) continue;
    if (text.length > 60) continue;
    if (text) return text;
  }
  return h2s.length > 1 ? $(h2s[1]).text().trim() : "";
}
