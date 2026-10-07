/**
 * Feat HTML Parser — dndtools.net structure
 *
 * Listing page:
 *   <table> with rows: <td><a href="/feats/{book}/{slug}/">Feat Name</a></td>
 *
 * Detail page:
 *   <h2>Feat Name</h2>
 *   [<a href="/feats/categories/general/">General</a>]
 *   <h4>Prerequisite</h4> <p>...</p>
 *   <h4>Benefit</h4> <div class="nice-textile"><p>...</p></div>
 *   <h4>Normal</h4> <p>...</p>
 *   <h4>Special</h4> <p>...</p>
 */

import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import {
  findContentHeading,
  findSectionElements,
  getPageTitle,
  getTagName,
} from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/page.ts";
import { normalizeWs } from "@/database/packages/dnd35-from-parser/tools/text/scrapedText.ts";
import type { FeatReference } from "@/database/packages/dnd35-from-parser/tools/types/feats.ts";

const KNOWN_LABELS = new Set(["prerequisite", "prerequisites", "benefit", "benefits", "normal", "special"]);

/**
 * A feat's categories, in their order: the links in the brackets after its heading
 * (`[<a href="/feats/categories/…">Fighter Bonus Feat</a>, <a …>General</a>]`).
 */
function featCategories($: cheerio.CheerioAPI, heading: cheerio.Cheerio<AnyNode>): string[] {
  let after = "";
  for (
    let node = heading[0].nextSibling;
    node && !(node.type === "tag" && node.name === "h4");
    node = node.nextSibling
  ) {
    after += $.html(node);
  }
  const bracket = after.match(/\[([^\]]*)\]/)?.[1] ?? "";
  return [...bracket.matchAll(/<a[^>]*href="\/feats\/categories\/[^"]+"[^>]*>([^<]+)<\/a>/gi)].map((m) => m[1].trim());
}

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

/**
 * Parse a single feat detail page.
 */
export function parseFeatDetailHtml(html: string): FeatReference["raw"][number] | null {
  const $ = cheerio.load(html);

  const name = getPageTitle($);
  if (!name) return null;

  const heading = findContentHeading($);
  const categories = heading ? featCategories($, heading) : [];
  // An epic feat or a skill trick is that whatever else it's listed in ([Divine, Epic], [Movement, Skill Trick]); any
  // other feat is its first category naming a type, the general one aside ([Fighter Bonus Feat, General])
  const typeOf = (category: string) => categories.find((c) => c.toLowerCase() === category);
  const featType = normalizeFeatType(
    typeOf("epic") ?? typeOf("skill trick") ?? categories.find((c) => c.toLowerCase() !== "general") ?? "general",
  );

  // Parse sections: Prerequisite, Benefit, Normal, Special
  const sections: Record<string, string> = {};

  $("h4").each((_, h4) => {
    const label = $(h4).text().trim().toLowerCase();
    if (!isKnownLabel(label)) return;

    const parts: string[] = [];
    for (const el of findSectionElements($(h4), ["h2", "h3", "h4"])) {
      const tag = getTagName(el);
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
