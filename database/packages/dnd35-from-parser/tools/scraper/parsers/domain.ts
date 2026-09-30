import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { sectionElements } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/page.ts";
import { normalizeWs } from "@/database/packages/dnd35-from-parser/tools/shared.ts";

// ---------------------------------------------------------------------------
// Domain HTML Parser — srd.dndtools.org's page of every domain
//
//   <a id="air-domain"></a>
//   <h5>AIR DOMAIN</h5>
//   <p>Granted Power: ...</p>
//   <h6>Air Domain Spells</h6>
//   <table> a row a spell level: "1 Obscuring Mist: ..." in one cell, or (a planar domain) the level, then its spells
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

    // Up to the next domain: its heading, or the anchor before it
    const siblings: cheerio.Cheerio<AnyNode>[] = [];
    for (const el of sectionElements(h5, ["h5"])) {
      if (el.is("a[id]") && el.attr("id")?.endsWith("-domain")) break;
      siblings.push(el);
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
    const description = normalizeWs(grantedParts.join(" "));

    const spells: { name: string; slug?: string; level: number }[] = [];
    const spellSeen = new Set<string>();
    /** Adds a spell once per level and name, with its slug when its link has one (`#slug`). */
    const addSpell = (level: number, spellName: string, href: string | undefined) => {
      const key = `${level}:${spellName}`;
      if (spellSeen.has(key)) return;
      spellSeen.add(key);
      const slug = href?.match(/#(.+)$/)?.[1];
      spells.push({ name: normalizeDomainSpellName(spellName), ...(slug ? { slug } : {}), level });
    };
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

          if (level >= 1 && level <= 9 && spellName) addSpell(level, spellName, firstTd.find("a[href]").first().attr("href"));
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
            if (spellName) addSpell(level, spellName, $(a).attr("href"));
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

function normalizeDomainSpellName(name: string): string {
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
