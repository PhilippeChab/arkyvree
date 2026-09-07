import * as cheerio from "cheerio";
import type { SpellReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";

// ---------------------------------------------------------------------------
// Spell HTML Parser — supports both dndtools.net and legacy srd.dndtools.org
//
// dndtools.net listing page:
//   <table> with columns: Spell name, School, Rulebook, Effect, Duration, Range, Components, Casting Time
//   → Missing: subschool, descriptors, level entries, target/area, saving throw, spell resistance, description
//   → Use detail pages for full data
//
// dndtools.net detail page:
//   <h2>Spell Name</h2>
//   School (Subschool) [Descriptor] — linked text
//   <strong>Level:</strong> Sorcerer 6, Wizard 6 — linked class entries
//   <strong>Components:</strong> V, S, M
//   ... (other stat fields)
//   <p>Description...</p>
//
// Legacy single-page (srd.dndtools.org):
//   <h6><a id="spell-slug">Spell Name</a></h6>
//   <span class="stat-block"><b>Label</b>: Value</span>
// ---------------------------------------------------------------------------

const VALID_SCHOOLS = new Set([
  "Abjuration", "Conjuration", "Divination", "Enchantment",
  "Evocation", "Illusion", "Necromancy", "Transmutation", "Universal",
]);

// ---------------------------------------------------------------------------
// Listing page parser (dndtools.net)
// ---------------------------------------------------------------------------

/**
 * Parse a spell listing page to extract spell names and URLs.
 */
export function parseSpellListingHtml(html: string): { name: string; url: string }[] {
  const $ = cheerio.load(html);
  const results: { name: string; url: string }[] = [];

  $("table tr").each((_, row) => {
    const firstCell = $(row).find("td").first();
    if (firstCell.length === 0) return;

    const link = firstCell.find("a").first();
    if (link.length === 0) return;

    const name = link.text().trim();
    const href = link.attr("href");
    if (!name || !href || !href.includes("/spells/")) return;

    results.push({ name, url: href });
  });

  return results;
}

// ---------------------------------------------------------------------------
// Detail page parser (dndtools.net)
// ---------------------------------------------------------------------------

/**
 * Parse a single spell detail page from dndtools.net.
 */
export function parseSpellDetailHtml(
  html: string,
  sourceUrl: string,
): SpellReference["raw"][number] | null {
  const $ = cheerio.load(html);

  const name = findContentH2($);
  if (!name) return null;

  // Derive slug from URL: /spells/{book}/{slug}--{id}/ → slug
  const urlSlugMatch = sourceUrl.match(/\/spells\/[^/]+\/([^/]+?)(?:--\d+)?\/?$/);
  const slug = urlSlugMatch ? urlSlugMatch[1] : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

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
    school = school.charAt(0).toUpperCase() + school.slice(1);
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
      if (isStatLabel(text)) { foundStats = true; return; }
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

// ---------------------------------------------------------------------------
// Legacy: single-page all-spells parser (srd.dndtools.org)
// ---------------------------------------------------------------------------

export function parseSpellsHtml(
  html: string,
  sourceUrl: string,
  book: string,
): { _meta: SpellReference["_meta"]; raw: SpellReference["raw"] } {
  const $ = cheerio.load(html);
  const spells: SpellReference["raw"] = [];

  const h6s = $("h6").toArray();

  for (let i = 0; i < h6s.length; i++) {
    const h6 = $(h6s[i]);
    const anchor = h6.find("a[id]").first();
    if (!anchor.length) continue;

    const slug = anchor.attr("id") ?? "";
    const name = (anchor.text().trim() || h6.text().trim()).replace(/\u2019/g, "'");
    if (!name || !slug) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const siblings: cheerio.Cheerio<any>[] = [];
    let el = h6.next();
    while (el.length && !el.is("h6")) {
      siblings.push(el);
      el = el.next();
    }

    const schoolLine = siblings.find((s) => s.is("p.initial"))?.find("i").text().trim() ?? "";
    const { school, subschool, descriptors } = parseSchoolLine(schoolLine);

    if (!school || !VALID_SCHOOLS.has(school)) continue;

    const stats = new Map<string, string>();
    for (const sib of siblings) {
      if (sib.is("span.stat-block") || sib.find("span.stat-block").length) {
        const blocks = sib.is("span.stat-block") ? [sib] : sib.find("span.stat-block").toArray().map((e) => $(e));
        for (const block of blocks) {
          const b = typeof block === "object" && "find" in block ? block : $(block);
          let label = b.find("b").first().text().trim().replace(/\s+/g, " ").replace(/:$/, "");
          label = label.replace(/^Targets?( or (?:Area|Targets?))?$/, "Target");
          const fullText = b.text().trim().replace(/\s+/g, " ");
          const value = fullText.replace(/^[^:]+:\s*/, "").trim();
          if (label && value) stats.set(label, value);
        }
      }
      if (sib.is("span[style*='font-weight']")) {
        const labelText = sib.text().trim().replace(/:$/, "");
        const nextText = sib[0] && sib[0].nextSibling;
        if (nextText && nextText.type === "text") {
          const value = (nextText as unknown as { data: string }).data.trim();
          if (labelText && value) stats.set(labelText, value);
        }
      }
      if (sib.is("p") && !sib.hasClass("initial")) {
        const italic = sib.find("i").first();
        if (italic.length) {
          const label = italic.text().trim();
          const STAT_LABELS = ["Level", "Components", "Casting Time", "Range", "Target", "Effect", "Area", "Duration", "Saving Throw", "Spell Resistance"];
          if (STAT_LABELS.includes(label)) {
            const fullText = sib.text().trim();
            const value = fullText.replace(/^[^:]+:\s*/, "").trim();
            if (value) stats.set(label, value);
          }
        }
      }
      if (sib.is("b")) {
        const label = sib.text().trim().replace(/\s+/g, " ").replace(/:$/, "");
        const STAT_LABELS_P4 = [
          "Level", "Components", "Casting Time", "Range", "Target", "Targets",
          "Target or Area", "Target or Targets", "Effect", "Area", "Duration",
          "Saving Throw", "Spell Resistance",
        ];
        if (STAT_LABELS_P4.includes(label)) {
          const nextNode = sib[0]?.nextSibling;
          if (nextNode && nextNode.type === "text") {
            const value = (nextNode as unknown as { data: string }).data
              .replace(/^:\s*/, "").replace(/\s+/g, " ").trim();
            if (value) {
              const normalizedLabel = label.replace(/^Targets?( or (?:Area|Targets?))?$/, "Target");
              stats.set(normalizedLabel, value);
            }
          }
        }
      }
    }

    const levelStr = stats.get("Level") ?? "";
    const levelEntries = parseLevelEntries(levelStr);
    const componentsStr = stats.get("Components") ?? "";
    const components = parseComponents(componentsStr);

    const STAT_LABELS_SET = new Set(["Level", "Components", "Casting Time", "Range", "Target", "Effect", "Area", "Duration", "Saving Throw", "Spell Resistance"]);
    const descParts: string[] = [];
    for (const sib of siblings) {
      if (sib.is("p") && !sib.hasClass("initial")) {
        const italic = sib.find("i").first();
        if (italic.length && STAT_LABELS_SET.has(italic.text().trim())) continue;
        descParts.push(sib.text().trim());
      }
    }
    const description = descParts.join("\n\n").replace(/\u2019/g, "'").replace(/\u2014/g, "\u2014").replace(/\u201c/g, '"').replace(/\u201d/g, '"');

    spells.push({
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
    });
  }

  return {
    _meta: {
      type: "spell",
      sourceUrl,
      book,
      scrapedAt: new Date().toISOString(),
    },
    raw: spells,
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function parseSchoolLine(line: string): { school: string; subschool?: string; descriptors: string[] } {
  if (!line) return { school: "", descriptors: [] };

  let remaining = line;
  let subschool: string | undefined;
  const descriptors: string[] = [];

  const descMatch = remaining.match(/\[([^\]]+)\]/);
  if (descMatch) {
    descriptors.push(...descMatch[1].split(",").map((d) => d.trim()).filter((d) => d && !/^see text/i.test(d)));
    remaining = remaining.replace(/\[[^\]]+\]/, "").trim();
  }

  const subMatch = remaining.match(/\(([^)]+)\)/);
  if (subMatch) {
    subschool = subMatch[1].trim();
    remaining = remaining.replace(/\([^)]+\)/, "").trim();
  }

  const school = remaining.trim();
  return { school, subschool, descriptors };
}

function parseLevelEntries(text: string): { className: string; level: number }[] {
  if (!text) return [];
  return text.split(",").map((part) => {
    const trimmed = part.trim();
    const match = trimmed.match(/^(.+?)\s+(\d+)$/);
    if (!match) return null;
    return { className: match[1].trim(), level: parseInt(match[2], 10) };
  }).filter((e): e is { className: string; level: number } => e !== null);
}

function parseComponents(text: string): string[] {
  if (!text) return [];
  return text.split(",").map((c) => c.trim()).filter(Boolean);
}

/** Parse stat fields from a dndtools.net detail page by walking the HTML structure */
function parseStatFields($: cheerio.CheerioAPI): Map<string, string> {
  const stats = new Map<string, string>();

  const FIELDS = new Set([
    "Level", "Components", "Casting Time", "Range", "Target", "Targets",
    "Target or Area", "Target or Targets", "Effect", "Area", "Duration",
    "Saving Throw", "Spell Resistance",
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
        // eslint-disable-next-line @typescript-eslint/consistent-type-imports
        const tag = (node as import("domhandler").Element).tagName?.toLowerCase();

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
      } else if (node.type === "text") {
        const text = (node as unknown as { data: string }).data?.trim();
        if (text) parts.push(text);
      }

      node = node.nextSibling;
    }

    const value = parts.join(" ").replace(/^:\s*/, "").replace(/,\s*$/, "").replace(/\s+/g, " ").trim();
    if (value) {
      const normalizedLabel = rawLabel.replace(/^Targets?( or (?:Area|Targets?))?$/, "Target");
      stats.set(normalizedLabel, value);
    }
  }

  return stats;
}

const STAT_LABEL_PREFIXES = [
  "Level:", "Components:", "Casting Time:", "Range:", "Target:", "Effect:",
  "Area:", "Duration:", "Saving Throw:", "Spell Resistance:",
];

function isStatLabel(text: string): boolean {
  return STAT_LABEL_PREFIXES.some((p) => text.startsWith(p));
}

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
