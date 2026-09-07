import * as cheerio from "cheerio";

// ---------------------------------------------------------------------------
// Race HTML Parser — dndtools.net structure
//
// Listing page: /races/?rulebook=N
//   <table> with rows: <td><a href="/races/{book}/{slug}/">Race Name</a></td>
//
// Detail page: /races/{book}/{slug}/
//   <h2>Race Name</h2>
//   <h3>Attributes</h3>
//     <table> Size, Base speed, ability scores, Favored Classes
//   <h3>Description</h3> <p>...</p>
//   <h3>Racial Traits</h3> <ul><li>...</li></ul>
// ---------------------------------------------------------------------------

const ABILITY_NAMES = new Set(["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"]);

// Django model IDs for size (fallback for "RaceSize object (N)" rendering)
const SIZE_ID_MAP: Record<string, string> = {
  "1": "Fine", "2": "Diminutive", "3": "Tiny", "4": "Small",
  "5": "Medium", "6": "Large", "7": "Huge", "8": "Gargantuan", "9": "Colossal",
};

const KNOWN_SIZES = new Set(["Fine", "Diminutive", "Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan", "Colossal"]);

// ---------------------------------------------------------------------------
// Listing page parser
// ---------------------------------------------------------------------------

/**
 * Parse a race listing page to extract race names and URLs.
 */
export function parseRaceListingHtml(html: string): { name: string; url: string }[] {
  const $ = cheerio.load(html);
  const results: { name: string; url: string }[] = [];

  $("table tr").each((_, row) => {
    const firstCell = $(row).find("td").first();
    if (firstCell.length === 0) return;

    const link = firstCell.find("a").first();
    if (link.length === 0) return;

    const name = link.text().trim();
    const href = link.attr("href");
    if (!name || !href || !href.includes("/races/")) return;

    results.push({ name, url: href });
  });

  return results;
}

// ---------------------------------------------------------------------------
// Detail page parser
// ---------------------------------------------------------------------------

/**
 * Parse a single race detail page.
 */
export function parseRaceDetailHtml(html: string): {
  name: string;
  description: string;
  size: string;
  baseSpeed: number;
  abilityAdjustments: { ability: string; value: number }[];
  favoredClass?: string;
  features: { name: string; description: string }[];
} | null {
  const $ = cheerio.load(html);

  const name = findContentH2($);
  if (!name) return null;

  // Parse attributes table
  let size = "";
  let baseSpeed = 0;
  const abilityAdjustments: { ability: string; value: number }[] = [];
  let favoredClass: string | undefined;

  $("table tr").each((_, row) => {
    const cells = $(row).find("td, th");
    if (cells.length < 2) return;

    const label = $(cells[0]).text().trim().replace(/:$/, "");
    const valueCell = $(cells[1]);
    const valueText = valueCell.text().trim();

    if (/^Size$/i.test(label)) {
      size = parseSize(valueText);
    } else if (/base speed/i.test(label)) {
      baseSpeed = parseSpeed(valueText);
    } else if (ABILITY_NAMES.has(label)) {
      const value = parseAbilityValue(valueText);
      if (value !== 0) {
        abilityAdjustments.push({ ability: label, value });
      }
    } else if (/^favored class/i.test(label)) {
      const link = valueCell.find("a").first();
      const fc = link.length > 0 ? link.text().trim() : valueText;
      if (fc && !/^any$/i.test(fc)) favoredClass = fc;
    }
  });

  // Parse description
  const descParts: string[] = [];
  const descHeader = $("h3").filter((_, el) =>
    /^Description/i.test($(el).text().trim()),
  ).first();

  if (descHeader.length > 0) {
    let el = descHeader.next();
    while (el.length > 0) {
      const tag = el.prop("tagName")?.toLowerCase();
      if (tag === "h3" || tag === "h2") break;
      if (tag === "p" || tag === "div") {
        const text = el.text().trim();
        if (text) descParts.push(text);
      }
      el = el.next();
    }
  }
  const description = descParts.join(" ").replace(/\s+/g, " ").trim();

  // Parse racial traits
  const features: { name: string; description: string }[] = [];
  const traitsHeader = $("h3").filter((_, el) =>
    /^Racial Traits/i.test($(el).text().trim()),
  ).first();

  if (traitsHeader.length > 0) {
    let el = traitsHeader.next();
    while (el.length > 0) {
      const tag = el.prop("tagName")?.toLowerCase();
      if (tag === "h3" || tag === "h2") break;

      if (tag === "ul" || tag === "ol") {
        el.find("li").each((_, li) => {
          const text = normalizeWs($(li).text());
          if (text) features.push(parseFeatureText(text));
        });
      } else if (tag === "p") {
        const text = normalizeWs(el.text());
        if (text) features.push(parseFeatureText(text));
      }

      el = el.next();
    }
  }

  return {
    name,
    description,
    size,
    baseSpeed,
    abilityAdjustments,
    ...(favoredClass ? { favoredClass } : {}),
    features,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSize(text: string): string {
  // Try known size names first (case-insensitive)
  for (const s of KNOWN_SIZES) {
    if (text.toLowerCase().includes(s.toLowerCase())) return s;
  }
  // Fallback: "RaceSize object (N)" pattern from Django
  const idMatch = text.match(/\((\d+)\)/);
  if (idMatch && SIZE_ID_MAP[idMatch[1]]) return SIZE_ID_MAP[idMatch[1]];
  return text;
}

function parseSpeed(text: string): number {
  // "RaceSpeedType object (9) 20" → extract the last number (actual speed)
  // "20 feet" → 20
  const numbers = [...text.matchAll(/(\d+)/g)].map((m) => parseInt(m[1], 10));
  // The actual speed is the last number (after the Django object ID)
  return numbers.length > 0 ? numbers[numbers.length - 1] : 0;
}

function parseAbilityValue(text: string): number {
  // Handle "+2", "−2" (Unicode minus), "-2" (ASCII hyphen), "+0"
  const normalized = text.replace(/[−–]/g, "-");
  const match = normalized.match(/([+-]?\d+)/);
  if (!match) return 0;
  return parseInt(match[1], 10);
}

function parseFeatureText(text: string): { name: string; description: string } {
  // Split on first colon if the prefix is a reasonable name length
  const colonIdx = text.indexOf(":");
  if (colonIdx > 0 && colonIdx < 80) {
    return {
      name: text.substring(0, colonIdx).trim(),
      description: text.substring(colonIdx + 1).trim(),
    };
  }
  // Fallback: use first sentence
  const dotIdx = text.indexOf(".");
  if (dotIdx > 0 && dotIdx < 80) {
    return {
      name: text.substring(0, dotIdx).trim(),
      description: text.substring(dotIdx + 1).trim(),
    };
  }
  return { name: text.substring(0, 60), description: text };
}

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Find the content h2, skipping the site tagline */
function findContentH2($: cheerio.CheerioAPI): string {
  const h2s = $("h2").toArray();
  for (const el of h2s) {
    const text = $(el).text().trim();
    if (text.match(/^(Feats|Races|D&D|Welcome|Home|About|Search|Login)/i)) continue;
    if (text.length > 60) continue;
    if (text) return text;
  }
  return h2s.length > 1 ? $(h2s[1]).text().trim() : "";
}
