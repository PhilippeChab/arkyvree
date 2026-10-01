import * as cheerio from "cheerio";

import { pageTitle, sectionElements, tagOf } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/page.ts";
import { normalizeWs } from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import type { FeatReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const KNOWN_LABELS = new Set(["prerequisite", "prerequisites", "benefit", "benefits", "normal", "special"]);

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
 * Parse a single feat detail page.
 */
export function parseFeatDetailHtml(html: string): FeatReference["raw"][number] | null {
  const $ = cheerio.load(html);

  const name = pageTitle($);
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
    const bracketMatch = $("h2")
      .first()
      .parent()
      .text()
      .match(/\[([^\]]+)\]/);
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
    for (const el of sectionElements($(h4), ["h2", "h3", "h4"])) {
      const tag = tagOf(el);
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
      } else if (tag === "p" || tag === "ul" || tag === "ol") {
        const text = normalizeWs(el.text());
        if (text) parts.push(text);
      }
      // Skip other elements (tables, etc.)
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
