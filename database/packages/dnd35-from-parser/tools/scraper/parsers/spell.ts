/**
 * Spell HTML Parser — supports both dndtools.net and legacy srd.dndtools.org
 *
 * dndtools.net listing page:
 *   <table> with columns: Spell name, School, Rulebook, Effect, Duration, Range, Components, Casting Time
 *   → Missing: subschool, descriptors, level entries, target/area, saving throw, spell resistance, description
 *   → Use detail pages for full data
 *
 * dndtools.net detail page:
 *   <h2>Spell Name</h2>
 *   School (Subschool) [Descriptor] — linked text
 *   <strong>Level:</strong> Sorcerer 6, Wizard 6 — linked class entries
 *   <strong>Components:</strong> V, S, M
 *   ... (other stat fields)
 *   <p>Description...</p>
 *
 * Legacy single-page (srd.dndtools.org):
 *   <h6><a id="spell-slug">Spell Name</a></h6>
 *   <span class="stat-block"><b>Label</b>: Value</span>
 */

import * as cheerio from "cheerio";
import { type Element, isText } from "domhandler";

import { pageTitle } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/page.ts";
import { normalizeWs } from "@/database/packages/dnd35-from-parser/tools/text.ts";
import type { SpellReference } from "@/database/packages/dnd35-from-parser/tools/types/spells.ts";
import { capitalize } from "@/shared/text.ts";

const STAT_LABEL_PREFIXES = [
  "Level:",
  "Components:",
  "Casting Time:",
  "Range:",
  "Target:",
  "Effect:",
  "Area:",
  "Duration:",
  "Saving Throw:",
  "Spell Resistance:",
];

const VALID_SCHOOLS = new Set([
  "Abjuration",
  "Conjuration",
  "Divination",
  "Enchantment",
  "Evocation",
  "Illusion",
  "Necromancy",
  "Transmutation",
  "Universal",
]);

function isStatLabel(text: string): boolean {
  return STAT_LABEL_PREFIXES.some((p) => text.startsWith(p));
}

function parseComponents(text: string): string[] {
  if (!text) return [];
  return text
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

function parseLevelEntries(text: string): { className: string; level: number }[] {
  if (!text) return [];
  return text
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      const match = trimmed.match(/^(.+?)\s+(\d+)$/);
      if (!match) return null;
      return { className: match[1].trim(), level: parseInt(match[2], 10) };
    })
    .filter((e): e is { className: string; level: number } => e !== null);
}

/** Parse stat fields from a dndtools.net detail page by walking the HTML structure */
function parseStatFields($: cheerio.CheerioAPI): Map<string, string> {
  const stats = new Map<string, string>();

  const FIELDS = new Set([
    "Level",
    "Components",
    "Casting Time",
    "Range",
    "Target",
    "Targets",
    "Target or Area",
    "Target or Targets",
    "Effect",
    "Area",
    "Duration",
    "Saving Throw",
    "Spell Resistance",
  ]);

  const content = $("#content");
  if (!content.length) return stats;

  // Find all <strong>/<b> elements that match a known field label
  const labelElements = content.find("strong, b").toArray();

  for (const labelEl of labelElements) {
    const rawLabel = $(labelEl).text().trim().replace(/:$/, "");
    if (!FIELDS.has(rawLabel)) continue;

    // Walk sibling nodes after the label, collecting text until the next
    // field label or a structural boundary (div, table, h2, h3)
    const parts: string[] = [];
    let node = labelEl.nextSibling;

    while (node) {
      if (node.type === "tag") {
        const tag = (node as Element).tagName?.toLowerCase();

        // Stop at structural boundaries — these start the description or a new section
        if (tag === "div" || tag === "table" || tag === "h2" || tag === "h3") break;

        // Stop at the next field label
        if (tag === "strong" || tag === "b") {
          const nextLabel = $(node).text().trim().replace(/:$/, "");
          if (FIELDS.has(nextLabel)) break;
        }

        // Skip <br/> — they separate fields but carry no text
        if (tag !== "br") {
          const text = $(node).text().trim();
          if (text) parts.push(text);
        }
      } else if (isText(node)) {
        const text = node.data.trim();
        if (text) parts.push(text);
      }

      node = node.nextSibling;
    }

    const value = normalizeWs(parts.join(" ").replace(/^:\s*/, "").replace(/,\s*$/, ""));
    if (value) {
      const normalizedLabel = rawLabel.replace(/^Targets?( or (?:Area|Targets?))?$/, "Target");
      stats.set(normalizedLabel, value);
    }
  }

  return stats;
}

/**
 * Parse a single spell detail page from dndtools.net.
 */
export function parseSpellDetailHtml(html: string, sourceUrl: string): SpellReference["raw"][number] | null {
  const $ = cheerio.load(html);

  const name = pageTitle($);
  if (!name) return null;

  // Derive slug from URL: /spells/{book}/{slug}--{id}/ → slug
  const urlSlugMatch = sourceUrl.match(/\/spells\/[^/]+\/([^/]+?)(?:--\d+)?\/?$/);
  const slug = urlSlugMatch
    ? urlSlugMatch[1]
    : name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

  // School/Subschool/Descriptors — linked text near the top
  // Pattern: <a href="/spells/schools/conjuration/">Conjuration</a> (<a href="...">Creation</a>) [<a href="...">Acid</a>]
  const bodyHtml = $("body").html() ?? "";
  let school = "";
  let subschool: string | undefined;
  const descriptors: string[] = [];

  // Extract school from link
  const schoolMatch = bodyHtml.match(/<a[^>]*href="\/spells\/schools\/([^"]+)\/"[^>]*>([^<]+)<\/a>/i);
  if (schoolMatch) {
    school = schoolMatch[2].trim();
    // Capitalize first letter
    school = capitalize(school);
  }

  // Extract subschool from link
  const subschoolMatch = bodyHtml.match(/<a[^>]*href="\/spells\/sub-schools\/[^"]+\/"[^>]*>([^<]+)<\/a>/i);
  if (subschoolMatch) {
    subschool = subschoolMatch[1].trim();
  }

  // Extract descriptors from links
  const descriptorRegex = /<a[^>]*href="\/spells\/descriptors\/[^"]+\/"[^>]*>([^<]+)<\/a>/gi;
  let descMatch;
  while ((descMatch = descriptorRegex.exec(bodyHtml)) !== null) {
    const desc = descMatch[1].trim();
    if (desc && !/^see text/i.test(desc)) {
      descriptors.push(desc);
    }
  }

  if (!VALID_SCHOOLS.has(school)) return null;

  // Parse stat fields — <strong>Label:</strong> Value or <b>Label:</b> Value
  const stats = parseStatFields($);

  // Level entries
  const levelStr = stats.get("Level") ?? "";
  const levelEntries = parseLevelEntries(levelStr);

  // Components
  const componentsStr = stats.get("Components") ?? "";
  const components = parseComponents(componentsStr);

  // Description — paragraphs after the stat fields, in nice-textile div or standalone
  const descParts: string[] = [];
  const niceTextile = $("div.nice-textile");
  if (niceTextile.length > 0) {
    niceTextile.find("p").each((_, p) => {
      const text = $(p).text().trim();
      if (text && !isStatLabel(text)) descParts.push(text);
    });
  }

  // Fallback: collect paragraphs after the last stat field
  if (descParts.length === 0) {
    let foundStats = false;
    $("p").each((_, p) => {
      const text = $(p).text().trim();
      if (isStatLabel(text)) {
        foundStats = true;
        return;
      }
      if (foundStats && text) descParts.push(text);
    });
  }

  const description = descParts.join("\n\n");

  return {
    name,
    slug,
    school,
    ...(subschool ? { subschool } : {}),
    descriptors,
    levelEntries,
    components,
    castingTime: stats.get("Casting Time") ?? "",
    range: stats.get("Range") ?? "",
    ...(stats.has("Target") ? { target: stats.get("Target") } : {}),
    ...(stats.has("Effect") ? { effect: stats.get("Effect") } : {}),
    ...(stats.has("Area") ? { area: stats.get("Area") } : {}),
    duration: stats.get("Duration") ?? "",
    savingThrow: stats.get("Saving Throw") ?? "",
    spellResistance: stats.get("Spell Resistance") ?? "",
    description,
  };
}
