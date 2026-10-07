import type * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import { type DndToolsPage } from "@/codegen/dnd3.5/tools/scraper/pages/DndToolsPage.ts";
import { Page } from "@/codegen/dnd3.5/tools/scraper/pages/Page.ts";
import { capitalizeTitle } from "@/codegen/dnd3.5/tools/text/names.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Reading what a class's page says of the class first: its name, description, hit die, skill points and alignment. */
export function ReadsSummary<B extends Constructor<DndToolsPage>>(Base: B) {
  abstract class ReadingSummary extends Base {
    /** The class's heading: its page's title, or its only h2. */
    private classHeading(): cheerio.Cheerio<AnyNode> {
      return this.contentHeading() ?? this.$("h2").first();
    }

    /** The text after a section's heading: its next element's with text, else the line after it in its parent. */
    private textAfter(header: cheerio.Cheerio<AnyNode>): string {
      const parts: string[] = [];
      for (const el of Page.section(header, ["h2", "h3", "h4"])) {
        const text = el.text().trim();
        if (text) parts.push(text);
        const tag = Page.tagName(el);
        if (tag === "p" || tag === "div") break;
      }
      // No element after it had text: the text after it in its parent
      if (parts.length === 0) {
        const parent = header.parent();
        if (parent.length > 0) {
          const fullText = parent.text();
          const headerText = header.text().trim();
          const idx = fullText.indexOf(headerText);
          if (idx >= 0) {
            const firstLine = fullText
              .substring(idx + headerText.length)
              .trim()
              .split("\n")[0]
              .trim();
            if (firstLine) return firstLine;
          }
        }
      }
      return parts.join(" ");
    }

    /** The alignment the class's Requirements section asks for (`<strong>Alignment:</strong> …`), if any. */
    alignment(): string | undefined {
      const reqHeader = this.heading(/^Requirements?$/i);
      for (const el of reqHeader.length > 0 ? Page.section(reqHeader) : []) {
        const alignMatch = el
          .text()
          .trim()
          .match(/^Alignment:\s*(.+)/i);
        if (alignMatch) return alignMatch[1].trim();
      }
      return undefined;
    }

    /** The ability the class's bonus spells come from, as its page's text says it, if it says it. */
    bonusSpellAbility(): string | undefined {
      const bodyText = this.$("body").text();
      const patterns = [
        /bonus spells are based on (Intelligence|Wisdom|Charisma)/i,
        // "receives bonus spells for a high Charisma score" (Warmage, Wu Jen…)
        /bonus spells for a high (Intelligence|Wisdom|Charisma)/i,
        /saves? (?:for these spells )?(?:have |has )?a DC of 10 \+ .*?\+ .*?(Intelligence|Wisdom|Charisma)/i,
        /must have (?:a |an )?(Intelligence|Wisdom|Charisma) score (?:equal to )?(?:at )?least 10/i,
      ];
      for (const pattern of patterns) {
        const match = bodyText.match(pattern);
        if (match) return match[1];
      }
      return undefined;
    }

    /** The class's description: up to three paragraphs between its heading and the first section heading. */
    description(): string {
      const paragraphs: string[] = [];
      const classH2 = this.classHeading();
      for (const el of classH2.length > 0 ? Page.section(classH2, ["h2", "h3", "h4"]) : []) {
        const tag = Page.tagName(el);
        if (tag === "p") {
          const text = el.text().trim();
          // Not a short text, a page reference, nor "all of the following" boilerplate
          if (text && text.length >= 20 && !text.match(/^\(.*p\.\s*\d+\)$/) && !text.match(/^All of the following/i))
            paragraphs.push(text);
        }
        // A div's paragraphs (nice-textile), but a div holding a feature's heading
        if (tag === "div" && !el.find("h3, h4, strong, b").length) {
          el.find("p").each((_, p) => {
            const text = this.$(p).text().trim();
            if (text && text.length >= 20) paragraphs.push(text);
          });
        }
      }
      return paragraphs.slice(0, 3).join(" ");
    }

    /** The class's hit die: its Hit die section's, else the page's text's, else d8. */
    hitDie(): string {
      const header = this.heading(/^Hit die$/i);
      const match = header.length > 0 ? this.textAfter(header).match(/d(\d+)/i) : null;
      if (match) return `d${match[1]}`;
      const hdMatch = this.$("body")
        .text()
        .match(/Hit\s+Die[:\s]*d(\d+)/i);
      return hdMatch ? `d${hdMatch[1]}` : "d8";
    }

    /** The class's name, in title case: its heading's, else "Unknown". */
    name(): string {
      const heading = this.classHeading();
      return heading.length > 0 ? capitalizeTitle(heading.text().trim()) : "Unknown";
    }

    /** The class's skill points: its Skill points section's, else the page's text's, else 2. */
    skillPoints(): string {
      const header = this.heading(/^Skill points$/i);
      const match = header.length > 0 ? this.textAfter(header).match(/(\d+)\s*\+\s*Int/i) : null;
      if (match) return `${match[1]} + Int modifier`;
      const spMatch = this.$("body")
        .text()
        .match(/Skill Points?\s+(?:at Each|per)\s+(?:Additional\s+)?Level[:\s]*(\d+)\s*\+/i);
      return spMatch ? `${spMatch[1]} + Int modifier` : "2 + Int modifier";
    }
  }
  return ReadingSummary;
}
