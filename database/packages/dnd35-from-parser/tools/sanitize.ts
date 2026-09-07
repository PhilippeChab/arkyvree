/** Book abbreviation suffixes found in scraped feat prerequisites (e.g., "Dodge (PH)"). */
export const BOOK_ABBREV_PATTERN = /\s*\((?:CAd|CAr|CA|CC|CD|CS|CW|DMG|DMG2|ECS|ELH|FR|MIC|MM|PH|PH2|PHB|PHB2|CV)\)/;

// All known source book names — used across multiple sanitization rules
const BOOK = "(?:Player's Handbook|Dungeon Master's Guide|Monster Manual|Complete Divine|Complete Warrior|Complete Arcane|Complete Adventurer)";
// Matches "Book" or "the Book" with optional trailing "book"/"handbook"/"sourcebook"
const THE_BOOK = `(?:the )?${BOOK}(?:\\s+(?:book|handbook|sourcebook))?`;

/**
 * Fix encoding artifacts only — safe to run on any string (names, descriptions, etc.).
 * Does NOT strip book references or rewrite content.
 */
export function fixEncoding(text: string): string {
  return text
    // HTML entities for smart quotes
    .replace(/&#8216;|&#8217;|&#8218;|&lsquo;|&rsquo;|&sbquo;/g, "'")
    .replace(/&#8220;|&#8221;|&#8222;|&ldquo;|&rdquo;|&bdquo;/g, '"')
    .replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, "-")
    .replace(/&#8230;|&hellip;/g, "...")
    .replace(/&#160;|&nbsp;/g, " ")
    // Unicode characters
    .replace(/[\u2018\u2019\u201A]/g, "'")  // smart single quotes
    .replace(/[\u201C\u201D\u201E]/g, '"')  // smart double quotes
    .replace(/[\u2013\u2014]/g, "-")        // en-dash, em-dash
    .replace(/[\u2026]/g, "...")             // ellipsis
    .replace(/\u00A0/g, " ")                // non-breaking space
    .replace(/\uFFFD/g, "'")                // replacement char (garbled apostrophe in source)
    // Broken apostrophes from dndtools.net: `?s`, `?t`, `s? ` → `'s`, `'t`, `s' `
    .replace(/(\w)\?([stST])\b/g, "$1'$2")
    .replace(/(\w)\?(\s)/g, "$1'$2")
    .replace(/\s*\n\s*/g, " ")              // collapse newlines into single space
    .replace(/  +/g, " ")                   // collapse multiple spaces
    .trim();
}

/**
 * Full sanitization for descriptions: encoding fixes + book reference stripping.
 * Only use on description/benefit text, not names.
 */
export function sanitizeText(text: string): string {
  return fixEncoding(text)
    // Strip physical book references
    .replace(new RegExp(BOOK_ABBREV_PATTERN.source, "g"), "")  // book abbreviation suffixes: "Dodge (PH)" → "Dodge"
    .replace(/\([^)]*(?:p\.|page)\s*(?:\d+|None)[^)]*\)/gi, "")  // (page X), (see X, page Y), (p. None), etc.
    .replace(new RegExp(`\\(${BOOK}[^)]*\\)`, "gi"), "") // (Player's Handbook, p. X), (Complete Divine variant, p. None)
    .replace(new RegExp(`\\(see (?:Chapter|${THE_BOOK})[^)]*\\)`, "gi"), "") // (see Chapter X: ...), (see the Player's Handbook)
    .replace(/\(see (?:above|below)\)/gi, "")  // (see above), (see below)
    .replace(new RegExp(`(?:on |in |of |presented on |described in )pages?\\s+\\d+(?:\\s*[-–]\\s*\\d+)?(?:\\s+(?:and|to)\\s+\\d+)?\\s+of ${THE_BOOK}`, "gi"), "") // inline "page X of the PHB"
    .replace(new RegExp(`(?:the )?${BOOK} description`, "gi"), "the rules") // "the Monster Manual description" → "the rules"
    .replace(new RegExp(`as (?:the spell )?described in ${THE_BOOK}`, "gi"), "") // "as described in the PHB"
    .replace(new RegExp(`(?:See |see )?${THE_BOOK}(?:\\s+(?:for|has))[^.]*\\.`, "gi"), "") // "The Monster Manual has game statistics for..."
    .replace(new RegExp(`(?:found |described |detailed |given |indicated )(?:in |on )${THE_BOOK}`, "gi"), "") // "found in the Monster Manual"
    .replace(new RegExp(`,?\\s*as (?:detailed|described|indicated|noted|given|shown) on Table [0-9?]+[-–]?\\d*(?::?\\s*[^.,]*)? in ${THE_BOOK}`, "gi"), "") // "as detailed on Table 2-2 in the DMG"
    .replace(new RegExp(`\\([^)]*${BOOK}[^)]*\\)`, "gi"), "") // any remaining parenthetical book refs
    .replace(new RegExp(`;\\s*see ${THE_BOOK}\\b[^.)]*\\.?`, "gi"), "") // "; see the Monster Manual"
    .replace(new RegExp(`(?:see|per|according to|covered in|in the) ${THE_BOOK}\\b[^.)]*\\.?`, "gi"), "") // "see the Monster Manual", "rules in the DMG"
    // Strip "For an explanation of ..., see ..." sentences (always refer to external rules)
    .replace(/For an explanation\b[^.]*\./gi, "")
    // Strip "Table X-Y" references — replace with "the class table" when inline, strip when standalone
    .replace(/,?\s*(?:see|as described in) Table [0-9?]+[-–]\d+[^.,]*/gi, "") // see Table 3-2: ...
    .replace(/(?:(?:on|in) )?Table [0-9?]+[-–]?\d*(?::?\s*[A-Z][^.,]*)?/gi, (match) => {
      // "as shown on Table 3-10: The Monk" → "as shown in the class table"
      // "column on Table 3-10: The Monk" → "column in the class table"
      if (/^(?:on|in) /i.test(match)) return "in the class table";
      return "the class table";
    })
    // Strip standalone "See Table" sentences (may be left after page stripping)
    .replace(/(?:See |see )the class table[^.]*?(?:,\s*and the class table[^.]*?)*\.?/gi, "")
    // Strip standalone page references: "page 155", ", page 38", etc.
    .replace(/,?\s*pages?\s+\d+(?:\s*[-–]\s*\d+)?(?:\s+(?:and|to)\s+\d+)?/gi, "")
    // Strip "See page X of" / "See page X" / dangling "See of" left after book name removal
    .replace(/See pages?\s+\d+(?:\s+of)?\b\.?/gi, "")
    .replace(/\bSee\s+of\b\.?/gi, "")
    // Strip meta-commentary notes about source material
    .replace(/\(Note:\s*[^)]*(?:exists in|from|per)\s*[^)]*\)/gi, "")
    // Clean up dangling fragments left by stripping
    .replace(/\(see\b\s*\)?/gi, "")          // "(see" or "(see)" left after content removal (word boundary prevents matching "(Seeker")
    .replace(/\.\s*See\s*\.?$/gi, ".")      // trailing "See." or ". See"
    // Remove sentences left with dangling verbs after reference stripping
    // e.g. "This ability functions." "Improved familiars otherwise use the rules."
    .replace(/[A-Z][^.]*?\b(?:functions?|otherwise use the rules|refer to)\s*\./g, "")
    // Strip sentences that are just "This ability is." or similar after removal of the rest
    .replace(/\b\w[\w\s]*?\bis\s*\.\s*/g, (match) => {
      // Only strip if the sentence is very short (dangling predicate)
      return match.length < 30 ? "" : match;
    })
    .replace(/\s+([.,])/g, "$1")            // fix space before punctuation left by removals
    .replace(/,\s*\./g, ".")                // fix ",." left by removals
    .replace(/\.\s*\./g, ".")               // fix ".." left by removals
    // Strip ad/tracking script text that leaks through (dndtools.net)
    .replace(/window\[?['"](nitroAds|__tcfapi)['"]\]?[\s\S]*/i, "")
    .replace(/\(function\(\)\{function c\(\)[\s\S]*/i, "")  // cloudflare challenge script
    .replace(/Update cookie preferences[\s\S]*/i, "")       // consent UI text
    .replace(/Also appears in [\w\s]+$/i, "")               // "Also appears in Book X"
    .replace(/  +/g, " ")                   // collapse multiple spaces
    .trim();
}

/**
 * Sanitize raw HTML before Cheerio parsing.
 *
 * Only applies encoding fixes that are safe for HTML structure.
 * Does NOT collapse newlines — that would break HTML tags that span lines
 * (e.g. dndtools.net has broken `</\n` closing tags that would merge into
 * the next element's opening tag if newlines were collapsed).
 */
export function sanitizeHtml(html: string): string {
  return html
    // Strip script tags and their content (dndtools.net injects ad scripts)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    // Fix broken closing tags (dndtools.net quirk):
    // `</\n` → `</p>\n` (missing tag name) and `</p\n` → `</p>\n` (missing >)
    .replace(/<\/\s*\n/g, "</p>\n")
    .replace(/<\/(\w+)\s*\n/g, "</$1>\n")
    // Fix broken apostrophes: `?s` / `?t` / `s? ` etc. → `'s` / `'t` / `s' ` (dndtools.net sends literal ? for ')
    .replace(/(\w)\?([stST])\b/g, "$1'$2")
    .replace(/(\w)\?(\s)/g, "$1'$2")
    // Fix known typos from dndtools.net
    .replace(/Enhanse/g, "Enhance")
    .replace(/[Pp]rofi [Cc]iency/g, "Proficiency")
    // HTML entities for smart quotes
    .replace(/&#8216;|&#8217;|&#8218;|&lsquo;|&rsquo;|&sbquo;/g, "'")
    .replace(/&#8220;|&#8221;|&#8222;|&ldquo;|&rdquo;|&bdquo;/g, '"')
    .replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, "-")
    .replace(/&#8230;|&hellip;/g, "...")
    .replace(/&#160;|&nbsp;/g, " ")
    // Unicode characters
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2026]/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/\uFFFD/g, "'");
}

/** Keys whose string values get full sanitization (encoding + book-reference stripping) */
const DESCRIPTION_KEYS = new Set(["description", "benefit", "normal", "special", "prerequisiteText", "text"]);

/**
 * Recursively sanitize all string values inside a parsed JSON object.
 * - ALL strings get encoding fixes (smart quotes, garbled apostrophes, etc.)
 * - Description-like keys also get book-reference stripping via sanitizeText
 */
export function sanitizeJsonValues<T>(obj: T, parentKey?: string): T {
  if (typeof obj === "string") {
    return (parentKey && DESCRIPTION_KEYS.has(parentKey) ? sanitizeText(obj) : fixEncoding(obj)) as T;
  }
  if (Array.isArray(obj)) return obj.map((item) => sanitizeJsonValues(item, parentKey)) as T;
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[fixEncoding(k)] = sanitizeJsonValues(v, k);
    }
    return result as T;
  }
  return obj;
}

/** Recursively sort all object keys for deterministic JSON output */
function sortKeys(val: unknown): unknown {
  if (Array.isArray(val)) return val.map(sortKeys);
  if (val !== null && typeof val === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(val as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((val as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return val;
}

/** JSON.stringify with sorted keys for deterministic output */
export function stableStringify(val: unknown): string {
  return JSON.stringify(sortKeys(val), null, 2) + "\n";
}
