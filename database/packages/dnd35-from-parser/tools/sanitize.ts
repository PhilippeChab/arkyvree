import { isRecord } from "@/shared/isRecord.ts";

/** Replacements, applied in order. */
type Replacements = [RegExp, string][];
/** Book abbreviation suffixes found in scraped feat prerequisites (e.g., "Dodge (PH)"). */
export const BOOK_ABBREV_PATTERN = /\s*\((?:CAd|CAr|CA|CC|CD|CS|CW|DMG|DMG2|ECS|ELH|FR|MIC|MM|PH|PH2|PHB|PHB2|CV)\)/;

// All known source book names — used across multiple sanitization rules
const BOOK =
  "(?:Player's Handbook|Dungeon Master's Guide|Monster Manual|Complete Divine|Complete Warrior|Complete Arcane|Complete Adventurer)";
// Matches "Book" or "the Book" with optional trailing "book"/"handbook"/"sourcebook"
const THE_BOOK = `(?:the )?${BOOK}(?:\\s+(?:book|handbook|sourcebook))?`;

/** Smart quotes, dashes, ellipses and non-breaking spaces, as entities or characters, and garbled apostrophes. */
const ENCODING: Replacements = [
  [/&#8216;|&#8217;|&#8218;|&lsquo;|&rsquo;|&sbquo;/g, "'"],
  [/&#8220;|&#8221;|&#8222;|&ldquo;|&rdquo;|&bdquo;/g, '"'],
  [/&#8211;|&#8212;|&ndash;|&mdash;/g, "-"],
  [/&#8230;|&hellip;/g, "..."],
  [/&#160;|&nbsp;/g, " "],
  [/[\u2018\u2019\u201A]/g, "'"],
  [/[\u201C\u201D\u201E]/g, '"'],
  [/[\u2013\u2014]/g, "-"],
  [/[\u2026]/g, "..."],
  [/\u00A0/g, " "],
  [/\uFFFD/g, "'"], // the replacement character: a garbled apostrophe in the source
];

/** dndtools.net sends a literal ? for an apostrophe: `?s`, `?t`, `s? ` → `'s`, `'t`, `s' `. */
const APOSTROPHES: Replacements = [
  [/(\w)\?([stST])\b/g, "$1'$2"],
  [/(\w)\?(\s)/g, "$1'$2"],
];

/** A string's encoding fixes, its lines then joined into one. */
const TEXT_FIXES: Replacements = [
  ...ENCODING,
  ...APOSTROPHES,
  [/\s*\n\s*/g, " "], // collapse newlines into single space
  [/  +/g, " "], // collapse multiple spaces
];

/** dndtools.net's HTML quirks and typos, and the encoding fixes. */
const HTML_FIXES: Replacements = [
  // Strip script tags and their content (dndtools.net injects ad scripts)
  [/<script[\s\S]*?<\/script>/gi, ""],
  [/<noscript[\s\S]*?<\/noscript>/gi, ""],
  // Fix broken closing tags (dndtools.net quirk):
  // `</\n` → `</p>\n` (missing tag name) and `</p\n` → `</p>\n` (missing >)
  [/<\/\s*\n/g, "</p>\n"],
  [/<\/(\w+)\s*\n/g, "</$1>\n"],
  ...APOSTROPHES,
  // Known typos from dndtools.net
  [/Enhanse/g, "Enhance"],
  [/[Pp]rofi [Cc]iency/g, "Proficiency"],
  ...ENCODING,
];

/** Keys whose string values get full sanitization (encoding + book-reference stripping) */
const DESCRIPTION_KEYS = new Set(["description", "benefit", "normal", "special", "prerequisiteText", "text"]);
const applyAll = (text: string, replacements: Replacements) =>
  replacements.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text);

/**
 * Fix encoding artifacts only — safe to run on any string (names, descriptions, etc.).
 * Does NOT strip book references or rewrite content.
 */
function fixEncoding(text: string): string {
  return applyAll(text, TEXT_FIXES).trim();
}

/**
 * Full sanitization for descriptions: encoding fixes + book reference stripping.
 * Only use on description/benefit text, not names.
 */
export function sanitizeText(text: string): string {
  return (
    fixEncoding(text)
      // Strip physical book references
      .replace(new RegExp(BOOK_ABBREV_PATTERN.source, "g"), "") // book abbreviation suffixes: "Dodge (PH)" → "Dodge"
      .replace(/\([^)]*(?:p\.|page)\s*(?:\d+|None)[^)]*\)/gi, "") // (page X), (see X, page Y), (p. None), etc.
      .replace(new RegExp(`\\(${BOOK}[^)]*\\)`, "gi"), "") // (Player's Handbook, p. X), (Complete Divine variant, p. None)
      .replace(new RegExp(`\\(see (?:Chapter|${THE_BOOK})[^)]*\\)`, "gi"), "") // (see Chapter X: ...), (see the Player's Handbook)
      .replace(/\(see (?:above|below)\)/gi, "") // (see above), (see below)
      .replace(
        new RegExp(
          `(?:on |in |of |presented on |described in )pages?\\s+\\d+(?:\\s*[-–]\\s*\\d+)?(?:\\s+(?:and|to)\\s+\\d+)?\\s+of ${THE_BOOK}`,
          "gi",
        ),
        "",
      ) // inline "page X of the PHB"
      .replace(new RegExp(`(?:the )?${BOOK} description`, "gi"), "the rules") // "the Monster Manual description" → "the rules"
      .replace(new RegExp(`as (?:the spell )?described in ${THE_BOOK}`, "gi"), "") // "as described in the PHB"
      .replace(new RegExp(`(?:See |see )?${THE_BOOK}(?:\\s+(?:for|has))[^.]*\\.`, "gi"), "") // "The Monster Manual has game statistics for..."
      .replace(new RegExp(`(?:found |described |detailed |given |indicated )(?:in |on )${THE_BOOK}`, "gi"), "") // "found in the Monster Manual"
      .replace(
        new RegExp(
          `,?\\s*as (?:detailed|described|indicated|noted|given|shown) on Table [0-9?]+[-–]?\\d*(?::?\\s*[^.,]*)? in ${THE_BOOK}`,
          "gi",
        ),
        "",
      ) // "as detailed on Table 2-2 in the DMG"
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
      .replace(/\(see\b\s*\)?/gi, "") // "(see" or "(see)" left after content removal (word boundary prevents matching "(Seeker")
      .replace(/\.\s*See\s*\.?$/gi, ".") // trailing "See." or ". See"
      // Remove sentences left with dangling verbs after reference stripping
      // e.g. "This ability functions." "Improved familiars otherwise use the rules."
      .replace(/[A-Z][^.]*?\b(?:functions?|otherwise use the rules|refer to)\s*\./g, "")
      // Strip sentences that are just "This ability is." or similar after removal of the rest
      .replace(/\b\w[\w\s]*?\bis\s*\.\s*/g, (match) => {
        // Only strip if the sentence is very short (dangling predicate)
        return match.length < 30 ? "" : match;
      })
      .replace(/\s+([.,])/g, "$1") // fix space before punctuation left by removals
      .replace(/,\s*\./g, ".") // fix ",." left by removals
      .replace(/\.\s*\./g, ".") // fix ".." left by removals
      // Strip ad/tracking script text that leaks through (dndtools.net)
      .replace(/window\[?['"](nitroAds|__tcfapi)['"]\]?[\s\S]*/i, "")
      .replace(/\(function\(\)\{function c\(\)[\s\S]*/i, "") // cloudflare challenge script
      .replace(/Update cookie preferences[\s\S]*/i, "") // consent UI text
      .replace(/Also appears in [\w\s]+$/i, "") // "Also appears in Book X"
      .replace(/  +/g, " ") // collapse multiple spaces
      .trim()
  );
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
  return applyAll(html, HTML_FIXES);
}

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
  if (isRecord(obj)) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[fixEncoding(k)] = sanitizeJsonValues(v, k);
    }
    return result as T;
  }
  return obj;
}

/** Recursively sort all object keys for deterministic JSON output */
export function sortKeysDeep(val: unknown): unknown {
  if (Array.isArray(val)) return val.map(sortKeysDeep);
  if (isRecord(val))
    return Object.fromEntries(
      Object.keys(val)
        .sort()
        .map((key) => [key, sortKeysDeep(val[key])]),
    );
  return val;
}

/** JSON.stringify with sorted keys for deterministic output */
export function stableStringify(val: unknown): string {
  return JSON.stringify(sortKeysDeep(val), null, 2) + "\n";
}
