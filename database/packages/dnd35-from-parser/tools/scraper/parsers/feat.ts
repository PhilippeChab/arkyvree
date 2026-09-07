import * as cheerio from "cheerio";
import type { FeatReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";

// ---------------------------------------------------------------------------
// Feat HTML Parser — dndtools.net structure
//
// Listing page:
//   <table> with rows: <td><a href="/feats/{book}/{slug}/">Feat Name</a></td>
//
// Detail page:
//   <h2>Feat Name</h2>
//   [<a href="/feats/categories/general/">General</a>]
//   <h4>Prerequisite</h4> <p>...</p>
//   <h4>Benefit</h4> <div class="nice-textile"><p>...</p></div>
//   <h4>Normal</h4> <p>...</p>
//   <h4>Special</h4> <p>...</p>
// ---------------------------------------------------------------------------

/**
 * Parse a feat listing page to extract feat names and URLs.
 */
export function parseFeatListingHtml(html: string): { name: string; url: string }[] {
  const $ = cheerio.load(html);
  const results: { name: string; url: string }[] = [];

  $("table tr").each((_, row) => {
    const firstCell = $(row).find("td").first();
    if (firstCell.length === 0) return;

    const link = firstCell.find("a").first();
    if (link.length === 0) return;

    const name = link.text().trim();
    const href = link.attr("href");
    if (!name || !href || !href.includes("/feats/")) return;

    results.push({ name, url: href });
  });

  return results;
}

/**
 * Parse a single feat detail page.
 */
export function parseFeatDetailHtml(
  html: string,
): FeatReference["raw"][number] | null {
  const $ = cheerio.load(html);

  // Name from <h2> — skip site tagline
  const name = findContentH2($);
  if (!name) return null;

  // Feat type from bracketed category links: [General], [Fighter Bonus Feat], [Metamagic]
  let featType = "general";
  const bodyText = $("body").html() ?? "";
  // Look for [<a href="/feats/categories/.../">Type</a>] pattern
  const categoryMatch = bodyText.match(/\[<a[^>]*href="\/feats\/categories\/([^"]+)\/"[^>]*>([^<]+)<\/a>\]/i);
  if (categoryMatch) {
    featType = normalizeFeatType(categoryMatch[2].trim());
  } else {
    // Fallback: look for bracket text near the top
    const bracketMatch = $("h2").first().parent().text().match(/\[([^\]]+)\]/);
    if (bracketMatch) {
      featType = normalizeFeatType(bracketMatch[1].trim());
    }
  }

  // Parse sections: Prerequisite, Benefit, Normal, Special
  const sections: Record<string, string> = {};

  $("h4").each((_, h4) => {
    const label = $(h4).text().trim().toLowerCase();
    if (!isKnownLabel(label)) return;

    const parts: string[] = [];
    let el = $(h4).next();
    while (el.length > 0) {
      const tag = el.prop("tagName")?.toLowerCase();
      if (tag === "h4" || tag === "h3" || tag === "h2") break;

      if (tag === "div") {
        // Skip divs that contain another section's label (broken HTML nesting)
        const divText = normalizeWs(el.text());
        const containsNextSection = /^(Prerequisite|Benefit|Normal|Special)\b/i.test(divText);
        if (!containsNextSection) {
          // nice-textile div contains paragraphs
          el.find("p").each((_, p) => {
            const text = normalizeWs($(p).text());
            if (text) parts.push(text);
          });
          if (el.find("p").length === 0 && divText) {
            parts.push(divText);
          }
        }
      } else if (tag === "p") {
        const text = normalizeWs(el.text());
        if (text) parts.push(text);
      } else if (tag === "ul" || tag === "ol") {
        const text = normalizeWs(el.text());
        if (text) parts.push(text);
      }
      // Skip other elements (tables, etc.)

      el = el.next();
    }

    const key = label.replace(/s$/, ""); // "prerequisites" → "prerequisite"
    sections[key] = parts.join(" ");
  });

  const benefit = sections["benefit"] ?? "";
  if (!benefit) return null;

  return {
    name,
    featType,
    prerequisiteText: sections["prerequisite"] ?? "",
    benefit,
    ...(sections["normal"] ? { normal: sections["normal"] } : {}),
    ...(sections["special"] ? { special: sections["special"] } : {}),
  };
}

/**
 * Legacy: parse a single-page all-feats HTML (old srd.dndtools.org format).
 * Kept for backward compatibility during migration.
 */
export function parseFeatsHtml(
  html: string,
  sourceUrl: string,
  book: string,
): { _meta: FeatReference["_meta"]; raw: FeatReference["raw"] } {
  const $ = cheerio.load(html);
  const raw: FeatReference["raw"] = [];

  const h5s = $("h5");

  h5s.each((_, h5) => {
    const headerText = $(h5).text().replace(/\s+/g, " ").trim();
    if (!headerText || headerText.length < 3) return;

    const match = headerText.match(/^(.+?)\s*\[([^\]]+)\]\s*$/);
    if (!match) return;

    const rawName = match[1].trim();
    const featType = match[2].trim().toLowerCase();
    const name = titleCase(rawName);

    const sections: Record<string, string> = {};
    let currentLabel = "";
    let currentText: string[] = [];

    let el = $(h5).next();
    while (el.length > 0) {
      const tag = el.prop("tagName")?.toLowerCase();
      if (tag === "h5" || tag === "h3" || tag === "h2" || tag === "h6") break;

      if (tag === "p") {
        const bold = el.find("b, strong").first();
        const boldText = bold.length > 0 ? bold.text().trim().replace(/:$/, "") : "";
        const fullText = normalizeWs(el.text());

        let detectedLabel = "";
        let afterLabel = "";
        if (boldText && isKnownLabel(boldText)) {
          detectedLabel = boldText.toLowerCase();
          afterLabel = fullText.substring(fullText.indexOf(boldText) + boldText.length)
            .replace(/^[:\s]+/, "").trim();
        } else if (!boldText) {
          const labelMatch = fullText.match(/^(Prerequisites?|Benefits?|Normal|Special)[:\s]/i);
          if (labelMatch) {
            detectedLabel = labelMatch[1].toLowerCase();
            afterLabel = fullText.substring(labelMatch[0].length).trim();
          }
        }

        if (detectedLabel && isKnownLabel(detectedLabel)) {
          if (currentLabel) {
            sections[currentLabel] = normalizeWs(currentText.join(" "));
          }
          currentLabel = detectedLabel;
          currentText = afterLabel ? [afterLabel] : [];
        } else if (currentLabel) {
          if (fullText) currentText.push(fullText);
        }
      }

      el = el.next();
    }

    if (currentLabel) {
      sections[currentLabel] = normalizeWs(currentText.join(" "));
    }

    const benefit = sections["benefit"] ?? sections["benefits"] ?? "";
    if (!benefit) return;

    raw.push({
      name,
      featType,
      prerequisiteText: sections["prerequisite"] ?? sections["prerequisites"] ?? "",
      benefit,
      ...(sections["normal"] ? { normal: sections["normal"] } : {}),
      ...(sections["special"] ? { special: sections["special"] } : {}),
    });
  });

  return {
    _meta: {
      type: "feat",
      sourceUrl,
      book,
      scrapedAt: new Date().toISOString(),
    },
    raw,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/(^|-|\()([a-z])/g, (_, pre, c) => pre + c.toUpperCase()))
    .join(" ");
}

const KNOWN_LABELS = new Set([
  "prerequisite", "prerequisites", "benefit", "benefits",
  "normal", "special",
]);

function isKnownLabel(text: string): boolean {
  return KNOWN_LABELS.has(text.toLowerCase());
}

function normalizeFeatType(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("fighter")) return "fighter";
  if (lower.includes("metamagic")) return "metamagic";
  if (lower.includes("item creation")) return "item creation";
  return lower;
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
