/**
 * A feat's page on dndtools.net:
 *   <h2>Feat Name</h2>
 *   [<a href="/feats/categories/general/">General</a>]
 *   <h4>Prerequisite</h4> <p>...</p>
 *   <h4>Benefit</h4> <div class="nice-textile"><p>...</p></div>
 *   <h4>Normal</h4> <p>...</p>
 *   <h4>Special</h4> <p>...</p>
 */

import type * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import { Page } from "@/codegen/core/scraper/Page.ts";
import { normalizeWs } from "@/codegen/core/text/whitespace.ts";
import type { FeatReference } from "@/codegen/dnd3.5/tools/types/feats.ts";

import { DndToolsPage } from "./DndToolsPage.ts";

/** The sections of a feat's page, by their heading. */
const KNOWN_LABELS = new Set(["prerequisite", "prerequisites", "benefit", "benefits", "normal", "special"]);

/** A feat's page on dndtools.net: its name, type, prerequisites, benefit, normal and special. */
export class FeatPage extends DndToolsPage {
  /**
   * The feat's categories, in their order: the links in the brackets after its heading
   * (`[<a href="/feats/categories/…">Fighter Bonus Feat</a>, <a …>General</a>]`).
   */
  private categories(heading: cheerio.Cheerio<AnyNode>): string[] {
    let after = "";
    for (
      let node = heading[0].nextSibling;
      node && !(node.type === "tag" && node.name === "h4");
      node = node.nextSibling
    )
      after += this.$.html(node);

    const bracket = after.match(/\[([^\]]*)\]/)?.[1] ?? "";
    return [...bracket.matchAll(/<a[^>]*href="\/feats\/categories\/[^"]+"[^>]*>([^<]+)<\/a>/gi)].map((m) =>
      m[1].trim(),
    );
  }

  /**
   * The feat's type, from its categories: an epic feat or a skill trick is that whatever else it's listed in ([Divine,
   * Epic], [Movement, Skill Trick]); any other feat is its first category naming a type, the general one aside
   * ([Fighter Bonus Feat, General]).
   */
  private featType(): string {
    const heading = this.contentHeading();
    const categories = heading ? this.categories(heading) : [];
    const typeOf = (category: string) => categories.find((c) => c.toLowerCase() === category);
    const type = (
      typeOf("epic") ??
      typeOf("skill trick") ??
      categories.find((c) => c.toLowerCase() !== "general") ??
      "general"
    ).toLowerCase();
    if (type.includes("fighter")) return "fighter";
    if (type.includes("metamagic")) return "metamagic";
    if (type.includes("item creation")) return "item creation";
    return type;
  }

  /** The text of each of the page's sections (Prerequisite, Benefit, Normal, Special), by its label, singular. */
  private sections(): Record<string, string> {
    const sections: Record<string, string> = {};
    this.$("h4").each((_, h4) => {
      const label = this.$(h4).text().trim().toLowerCase();
      if (!KNOWN_LABELS.has(label)) return;

      const parts: string[] = [];
      for (const el of Page.section(this.$(h4), ["h2", "h3", "h4"])) {
        const tag = Page.tagName(el);
        if (tag === "div") {
          // Skip divs that contain another section's label (broken HTML nesting)
          const divText = normalizeWs(el.text());
          const containsNextSection = /^(Prerequisite|Benefit|Normal|Special)\b/i.test(divText);
          if (!containsNextSection) {
            // nice-textile div contains paragraphs
            el.find("p").each((_, p) => {
              const text = normalizeWs(this.$(p).text());
              if (text) parts.push(text);
            });
            if (el.find("p").length === 0 && divText) parts.push(divText);
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
    return sections;
  }

  /** The feat, as its reference stores it: none for a page without a title or a benefit. */
  read(): FeatReference["raw"][number] | undefined {
    const name = this.title();
    if (!name) return undefined;

    const featType = this.featType();
    const sections = this.sections();
    const benefit = sections["benefit"] ?? "";
    if (!benefit) return undefined;

    return {
      name,
      featType,
      prerequisiteText: sections["prerequisite"] ?? "",
      benefit,
      ...(sections["normal"] ? { normal: sections["normal"] } : {}),
      ...(sections["special"] ? { special: sections["special"] } : {}),
    };
  }
}
