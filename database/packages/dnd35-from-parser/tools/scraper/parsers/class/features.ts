/**
 * Class features — driven by the advancement table's Special column
 *
 * Strategy:
 *   1. Collect unique feature names from the Special column (authoritative list)
 *   2. Always include "Weapon and Armor Proficiency" and "Spells" (not in Special)
 *   3. Collect all text blocks from the Class Features section
 *   4. Match each feature name to its description in the text
 */

import type * as cheerio from "cheerio";
import { type AnyNode } from "domhandler";

import { normalizeWs } from "@/database/packages/dnd35-from-parser/tools/scrapedText.ts";
import { findSectionHeader } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/class/sections.ts";
import { capitalizeTitle } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/class/titleCase.ts";
import { findSectionElements, getTagName } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/page.ts";
import { type ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";

/** A feature's type (Ex, Su, Sp), when its heading gives one, and its description. */
type FeatureDescription = { type?: string; desc: string };

type RawFeature = ClassReference["raw"]["classFeatures"][number];

/** A feature's heading: its name, and its type when it gives one ("Evasion (Ex)"). */
const FEATURE_HEADER_PATTERN = /^(.+?)\s*(\((Ex|Su|Sp)\))?\s*$/;

/** Names that always count as features even if not in the Special column.
 *  These are common features described on class pages but not listed in
 *  the progression table's Special column. */
const IMPLICIT_FEATURES = [
  "Weapon and Armor Proficiency",
  "Spells",
  "Spells per Day",
  "Spells per Day/Spells Known",
  "Spells and Caster Level",
  "AC Bonus",
  "Spontaneous Casting",
  "Chaotic, Evil, Good, and Lawful Spells",
  "Spellbooks",
  "Aura",
  "Deity, Domains, and Domain Spells",
  "Fast Movement",
  "Flurry of Blows",
];

/**
 * Clean a Special column entry to its base feature name.
 * "Sneak Attack +1d6" → "Sneak Attack"
 * "hexblade's curse 2/day" → "hexblade's curse"
 * "Ignore spell failure 10%" → "Ignore spell failure"
 * "Slow Fall 20 ft." → "Slow Fall"
 * "Damage Reduction 3/-" → "Damage Reduction"
 */
function cleanSpecialEntry(s: string): string {
  return s
    .replace(/\s*\+\d+(?:d\d+)?(?:\/\+\d+(?:d\d+)?)*$/, "") // +1, +1d6, +1/+1d6
    .replace(/\s*\+?\d+\/day$/i, "") // 2/day, +1/day
    .replace(/\s*\d+%$/, "") // 10%
    .replace(/\s*\d+\s*(?:ft\.?|feet)$/i, "") // 20 ft.
    .replace(/\s*\d+\/[-–]$/, "") // 3/-
    .replace(/\s*\d+\/(?:week|round)$/i, "") // 1/week
    .replace(/\s*\(\d+(?:st|nd|rd|th)\)$/, "") // (1st)
    .replace(/\s*\(\d+(?:st|nd|rd|th) type\)$/i, "") // (1st type)
    .replace(/\s*\([^)]*\d+\/day[^)]*\)$/i, "") // (elemental 1/day)
    .replace(
      /\s*\((?:black|brown|dire|large|small|tiny|huge|plant|elemental|magic|lawful|adamantine|move action|free action|two|four|radius)[^)]*\)$/i,
      "",
    ) // (black), (magic), (huge elemental), etc.
    .replace(/\s*(?:any distance)$/i, "") // any distance
    .replace(/^(?:1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)\s+/i, "") // "1st Favored Enemy" → "Favored Enemy"
    .replace(/\s*\+\d+\s+(?:level of existing .*spellcasting class)$/i, "") // "+1 level of existing..."
    .replace(/^[^A-Za-z]*/, "") // strip leading non-alpha chars (broken parens, etc.)
    .replace(/\s*\([^)]*\d[^)]*\)?\s*$/, "") // strip trailing parenthetical containing numbers: (+1), (2d8), (1/day)
    .replace(/\s*\([^)]*$/, "") // strip any unclosed paren at end
    .replace(/^([^(]*)\)$/, "$1") // strip orphaned trailing ) only when no opening (
    .replace(/\d+\/day$/, "") // leftover "2/day" after paren strip
    .trim()
    .replace(/^(?:huge |large |small )?elemental$/i, ""); // orphaned fragments from broken wild shape cells
}

/** Find the exact key in the known features set that matches this name */
function findMatchingFeatureKey(name: string, knownFeatures: Set<string>): string | undefined {
  const norm = normalizeFeatureName(name);
  const lower = name.toLowerCase();
  // The name, or a plural variant
  const exact = [norm, lower, lower + "s", lower.replace(/s$/, ""), norm + "s", norm.replace(/s$/, "")].find((n) =>
    knownFeatures.has(n),
  );
  if (exact !== undefined) return exact;
  // A known feature starting with this name
  // e.g. "Mounted Weapon Bonus" matches "Mounted Weapon Bonus (Lance)"
  for (const known of knownFeatures) {
    if (known.startsWith(norm + " ") || known.startsWith(lower + " ")) return known;
  }
  // A known feature this name starts with, then a non-alpha suffix
  // e.g. "Rage +1/Day" matches "Rage" (suffix starts with +)
  // But NOT "Terrain Mastery Benefits" matching "Terrain Mastery" (suffix is a word)
  for (const known of knownFeatures) {
    if (norm.startsWith(known) && norm.length > known.length) {
      const suffix = norm.substring(known.length);
      if (/^[^a-z\s]/.test(suffix.trim())) return known; // +1/day, (lance), etc. — but not "Benefits"
    }
  }
  return undefined;
}

/** Find name and effect column indices from a sub-option table */
function findSubOptionColumns(
  $: cheerio.CheerioAPI,
  table: cheerio.Cheerio<AnyNode>,
): { nameCol: number; effectCol: number } {
  // Find the header row with the most <th> cells (skip title rows with 1 spanning th, and footnote rows)
  const headerRows = table.find("tr").filter((_, row) => $(row).children("th").length > 1);
  if (headerRows.length === 0) return { nameCol: -1, effectCol: -1 };

  // Use the row with the most th cells
  let bestRow = headerRows.first();
  let bestCount = bestRow.children("th").length;
  headerRows.each((_, row) => {
    const count = $(row).children("th").length;
    if (count > bestCount) {
      bestRow = $(row);
      bestCount = count;
    }
  });

  const headers = bestRow
    .children("th")
    .toArray()
    .map((th) => $(th).text().trim().toLowerCase());
  const nameCol = headers.findIndex((h) => /^(secret|name|ability|trick|mastery|option|maneuver)$/i.test(h));
  const effectCol = headers.findIndex((h) => /^(effect|benefit|description)$/i.test(h));
  return { nameCol, effectCol };
}

/** Check if a feature name matches any known feature (case-insensitive, with plural matching) */
function isKnownFeature(name: string, knownFeatures: Set<string>): boolean {
  return findMatchingFeatureKey(name, knownFeatures) !== undefined;
}

/** The names the class's features go by, normalized: the progression's Special column's, and the implicit ones. */
function knownFeatureNames(progression: ClassReference["raw"]["progression"]): Set<string> {
  const featureNames = new Set<string>();
  for (const name of IMPLICIT_FEATURES) featureNames.add(normalizeFeatureName(name));

  for (const row of progression) {
    for (const s of row.special) {
      const cleaned = cleanSpecialEntry(s);
      if (cleaned && cleaned.length > 1) featureNames.add(normalizeFeatureName(cleaned));
    }
  }
  return featureNames;
}

/** Normalize a feature name for matching — strips plurals, collapses whitespace */
function normalizeFeatureName(name: string): string {
  // "Special Abilities" → "special ability"
  return normalizeWs(name.toLowerCase()).replace(/ies$/, "y");
}

/**
 * The class's features in progression order: the implicit ones its page describes, then those of its Special column
 * (by their normalized name, deduplicated), then the sub-features its tables and sub-sections describe.
 */
function orderedFeatures(
  progression: ClassReference["raw"]["progression"],
  descriptions: Map<string, FeatureDescription>,
): RawFeature[] {
  const features: RawFeature[] = [];
  const seen = new Set<string>();

  // Add implicit features first (WAP, Spells)
  for (const name of IMPLICIT_FEATURES) {
    const key = normalizeFeatureName(name);
    if (descriptions.has(key) && !seen.has(key)) {
      seen.add(key);
      const entry = descriptions.get(key)!;
      features.push({ name, type: entry.type, description: entry.desc });
    }
  }

  // Add features in progression order (deduplicated by normalized name)
  for (const row of progression) {
    for (const s of row.special) {
      const cleaned = cleanSpecialEntry(s);
      const key = normalizeFeatureName(cleaned);
      if (seen.has(key) || !key) continue;
      seen.add(key);

      // Look up description from the descriptions (try normalized, then plural variants)
      let entry = descriptions.get(key);
      if (!entry) entry = descriptions.get(key + "s");
      if (!entry) entry = descriptions.get(key.replace(/y$/, "ies"));

      if (entry) {
        features.push({ name: capitalizeTitle(cleaned), type: entry.type, description: entry.desc });
      } else {
        features.push({ name: capitalizeTitle(cleaned), description: "" });
      }
    }
  }

  // Add sub-features from tables and sub-section headings (e.g. "Secret: Instant Mastery")
  for (const [key, entry] of descriptions) {
    if (seen.has(key)) continue;
    if (key.includes(":")) {
      seen.add(key);
      features.push({ name: capitalizeTitle(key), type: entry.type, description: entry.desc });
    }
  }
  return features;
}

/** A sub-option table's options of the feature `parentKey`: each its key ("Feature: Option") and effect. */
function subOptionRows(
  $: cheerio.CheerioAPI,
  table: cheerio.Cheerio<AnyNode>,
  parentKey: string,
): { key: string; desc: string }[] {
  const { nameCol, effectCol } = findSubOptionColumns($, table);
  if (nameCol < 0) return [];
  return table
    .find("tr")
    .toArray()
    .flatMap((row) => {
      const cells = $(row)
        .find("td")
        .toArray()
        .map((td) => $(td).text().trim());
      if (cells.length <= nameCol || !cells[nameCol] || $(row).find("td[colspan]").length > 0) return [];
      const subName = cells[nameCol].replace(/\s*\*$/, "");
      return [
        {
          key: normalizeFeatureName(`${parentKey}: ${subName}`),
          desc: effectCol >= 0 && cells[effectCol] ? cells[effectCol] : "",
        },
      ];
    });
}

/**
 * The descriptions a class's page gives its features, by their normalized name, read from its Class Features section
 * element by element: an <h4> heading, a <p><strong>Name:</strong> desc, a plain "Name:" paragraph, a paragraph
 * continuing the feature before it, a table of a feature's sub-options.
 */
class FeatureDescriptions {
  constructor(
    private readonly $: cheerio.CheerioAPI,
    private readonly featureNames: Set<string>,
  ) {}

  /** Each feature's type and description, by its normalized name. */
  readonly byKey = new Map<string, FeatureDescription>();

  /** The feature the next paragraphs continue, if any. */
  private currentFeature: string | null = null;

  /** An <h4>: a known feature's heading, or a "Feature Benefits" / "Feature Options" sub-section's. */
  private readHeading(el: cheerio.Cheerio<AnyNode>) {
    const h4Text = el.text().trim();
    const match = h4Text.match(FEATURE_HEADER_PATTERN);
    if (!match) return;
    const name = match[1].trim();
    if (isKnownFeature(name, this.featureNames)) {
      this.currentFeature = normalizeFeatureName(name);
      this.byKey.set(this.currentFeature, {
        type: match[3] ? `(${match[3]})` : undefined,
        desc: "",
      });
      return;
    }
    // Check for "Feature Benefits" / "Feature Options" sub-section header
    // e.g. "Terrain Mastery Benefits" → parse children as "Terrain Mastery: X"
    const subMatch = name.match(/^(.+?)\s+(?:Benefits|Options|Choices|Selections)$/i);
    if (subMatch) this.readSubSection(el, subMatch[1]);
    this.currentFeature = null;
  }

  /**
   * A paragraph: a feature's own (`<strong>Name:</strong> desc`, or a plain "Name (Ex): desc"), or the current
   * feature's continued.
   */
  private readParagraph(el: cheerio.Cheerio<AnyNode>) {
    let handled = false;

    // Check for <strong>Name:</strong> pattern
    const strong = el.find("strong, b").first();
    if (strong.length > 0) {
      const headerText = strong.text().trim().replace(/:$/, "");
      const match = headerText.match(FEATURE_HEADER_PATTERN);
      if (match && match[1].length < 100) {
        const name = match[1].trim();
        if (isKnownFeature(name, this.featureNames)) {
          this.currentFeature = findMatchingFeatureKey(name, this.featureNames) ?? normalizeFeatureName(name);
          const fullText = el.text().trim();
          const desc = fullText
            .substring(fullText.indexOf(headerText) + headerText.length)
            .replace(/^[:\s]+/, "")
            .trim();
          this.byKey.set(this.currentFeature, {
            type: match[3] ? `(${match[3]})` : undefined,
            desc,
          });
          handled = true;
        } else if (match[3]) {
          // Unknown bold heading WITH type marker (Ex/Su/Sp) — likely a sub-option
          // of the current feature (e.g. "Earthgrip (Sp)" under "Stone Power")
        } else {
          // Unknown bold heading WITHOUT type marker — break continuation chain
          this.currentFeature = null;
          handled = true;
        }
      }
    }

    // Check for plain text "Name (Ex):" or "Name:" pattern
    if (!handled) {
      const plainText = el.text().trim();
      const plainMatch = plainText.match(/^([A-Z][^:]{2,60}?)\s*(?:\((Ex|Su|Sp)\)\s*)?:\s+([\s\S]*)/);
      if (plainMatch) {
        const name = plainMatch[1].trim();
        if (isKnownFeature(name, this.featureNames)) {
          this.currentFeature = normalizeFeatureName(name);
          this.byKey.set(this.currentFeature, {
            type: plainMatch[2] ? `(${plainMatch[2]})` : undefined,
            desc: plainMatch[3].trim(),
          });
          handled = true;
        }
      }
    }

    // Continuation paragraph — append to current feature
    if (!handled && this.currentFeature && this.byKey.has(this.currentFeature)) {
      const text = el.text().trim();
      if (text) {
        const entry = this.byKey.get(this.currentFeature)!;
        entry.desc = entry.desc ? `${entry.desc} ${text}` : text;
      }
    }
  }

  /** A sub-section's paragraphs ("Name: desc"), each a sub-feature of `parentName`'s ("Terrain Mastery: X"). */
  private readSubSection(el: cheerio.Cheerio<AnyNode>, parentName: string) {
    for (const next of findSectionElements(el, ["h2", "h3", "h4", "table"])) {
      if (getTagName(next) === "p") {
        const pText = next.text().trim();
        const subFeatureMatch = pText.match(/^([A-Z][^:]{1,60}?)\s*:\s*([\s\S]*)/);
        if (subFeatureMatch) {
          // Keep parentheticals that are part of the name like "(Planar)"
          const subName = `${parentName}: ${subFeatureMatch[1].trim()}`;
          const subDesc = subFeatureMatch[2].trim();
          this.byKey.set(normalizeFeatureName(subName), { desc: subDesc });
        }
      }
    }
  }

  /** An element of the Class Features section. */
  read(el: cheerio.Cheerio<AnyNode>) {
    const tag = getTagName(el);
    // h4 heading — potential feature or sub-section header
    if (tag === "h4") return this.readHeading(el);
    // Paragraph — could be inline feature or continuation
    if (tag === "p") this.readParagraph(el);
    // Table — check for sub-option tables (e.g. Loremaster Secrets)
    if (tag === "table" && this.currentFeature) {
      for (const { key, desc } of subOptionRows(this.$, el, this.currentFeature)) this.byKey.set(key, { desc });
    }
  }

  /**
   * The sub-option tables anywhere on the page (some, like Loremaster Secrets, are outside the Class Features
   * section), each a known feature's by its title: the sub-options not already described.
   */
  readPageTables() {
    const $ = this.$;
    $("table").each((_, table) => {
      if (findSubOptionColumns($, $(table)).nameCol < 0) return;

      // Find the parent feature from the table title (first th in first row, often spanning)
      const titleRow = $(table).find("tr").first();
      const titleTh = titleRow.find("th[colspan], th").first();
      const titleText = titleTh.text().trim().toLowerCase();

      // Match title to a known feature (e.g. "Loremaster Secrets" → "secret")
      let parentKey: string | null = null;
      for (const [key] of this.byKey) {
        if (titleText.includes(key) || key.includes(titleText.replace(/s$/, ""))) {
          parentKey = key;
          break;
        }
      }
      if (!parentKey) return;

      for (const { key, desc } of subOptionRows($, $(table), parentKey)) {
        if (!this.byKey.has(key)) this.byKey.set(key, { desc });
      }
    });
  }
}

export function parseClassFeatures(
  $: cheerio.CheerioAPI,
  progression: ClassReference["raw"]["progression"],
): ClassReference["raw"]["classFeatures"] {
  // Step 1: Build the authoritative feature name list from the Special column
  const featureNames = knownFeatureNames(progression);

  // Step 2: Collect all text blocks from the Class Features section
  let cfHeader = findSectionHeader($, /^Class Features$/i);
  if (cfHeader.length === 0) {
    cfHeader = $("h6")
      .filter((_, el) => /^Class Features$/i.test($(el).text().trim()))
      .first();
  }
  if (cfHeader.length === 0) return [];

  const descriptions = new FeatureDescriptions($, featureNames);
  for (const el of findSectionElements(cfHeader)) descriptions.read(el);
  descriptions.readPageTables();

  // Step 3: Build the features array in progression order
  return orderedFeatures(progression, descriptions.byKey);
}
