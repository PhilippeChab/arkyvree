/**
 * A spell's page on dndtools.net:
 *   <h2>Spell Name</h2>
 *   School (Subschool) [Descriptor]: linked text
 *   <strong>Level:</strong> Sorcerer 6, Wizard 6: linked class entries
 *   <strong>Components:</strong> V, S, M
 *   ... (other stat fields)
 *   <p>Description...</p>
 */

import { type Element, isText } from "domhandler";

import { normalizeWs } from "@/codegen/dnd3.5/tools/text/scrapedText.ts";
import type { SpellReference } from "@/codegen/dnd3.5/tools/types/spells.ts";
import { SPELL_SCHOOLS } from "@/shared/dnd3.5/spells.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { capitalize } from "@/shared/text.ts";

import { DndToolsPage } from "./DndToolsPage.ts";

/** The stat fields' labels a spell's page writes in bold, before its value. */
const STAT_FIELDS = new Set([
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

/** How a paragraph that's a stat field starts, which a description's paragraph doesn't. */
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

/** Whether a paragraph's text is a stat field's (`Level: …`). */
function isStatLabel(text: string): boolean {
  return STAT_LABEL_PREFIXES.some((p) => text.startsWith(p));
}

/** A spell's page on dndtools.net (`url`): its name, school, levels, components, stats and description. */
export class SpellPage extends DndToolsPage {
  constructor(
    html: string,
    readonly url: string,
  ) {
    super(html);
  }

  /** The spell's description: the paragraphs after its stat fields, in its nice-textile div or standalone. */
  private description(): string {
    const descParts: string[] = [];
    const niceTextile = this.$("div.nice-textile");
    if (niceTextile.length > 0) {
      niceTextile.find("p").each((_, p) => {
        const text = this.$(p).text().trim();
        if (text && !isStatLabel(text)) descParts.push(text);
      });
    }

    // Fallback: the paragraphs after the last stat field
    if (descParts.length === 0) {
      let foundStats = false;
      this.$("p").each((_, p) => {
        const text = this.$(p).text().trim();
        if (isStatLabel(text)) {
          foundStats = true;
          return;
        }
        if (foundStats && text) descParts.push(text);
      });
    }

    return descParts.join("\n\n");
  }

  /**
   * The spell's school, subschool and descriptors: the links near its top
   * (`<a href="/spells/schools/conjuration/">Conjuration</a> (<a …>Creation</a>) [<a …>Acid</a>]`).
   */
  private schools(): { descriptors: string[]; school: string; subschool?: string } {
    const bodyHtml = this.$("body").html() ?? "";
    const schoolMatch = bodyHtml.match(/<a[^>]*href="\/spells\/schools\/([^"]+)\/"[^>]*>([^<]+)<\/a>/i);
    const school = schoolMatch ? capitalize(schoolMatch[2].trim()) : "";
    const subschool = bodyHtml.match(/<a[^>]*href="\/spells\/sub-schools\/[^"]+\/"[^>]*>([^<]+)<\/a>/i)?.[1].trim();
    const descriptors = [...bodyHtml.matchAll(/<a[^>]*href="\/spells\/descriptors\/[^"]+\/"[^>]*>([^<]+)<\/a>/gi)]
      .map((match) => match[1].trim())
      .filter((desc) => desc && !/^see text/i.test(desc));
    return { school, ...(subschool ? { subschool } : {}), descriptors };
  }

  /** The spell's slug, from its URL (`/spells/{book}/{slug}--{id}/`), else from its name. */
  private slug(name: string): string {
    const urlSlugMatch = this.url.match(/\/spells\/[^/]+\/([^/]+?)(?:--\d+)?\/?$/);
    return urlSlugMatch
      ? urlSlugMatch[1]
      : name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
  }

  /**
   * The spell's stat fields, by label (`Target` for its every spelling): each bold label's text, up to the next label
   * or a structural boundary (a div, a table, a heading).
   */
  private stats(): Map<string, string> {
    const stats = new Map<string, string>();
    const content = this.$("#content");
    if (!content.length) return stats;

    for (const labelEl of content.find("strong, b").toArray()) {
      const rawLabel = this.$(labelEl).text().trim().replace(/:$/, "");
      if (!STAT_FIELDS.has(rawLabel)) continue;

      const parts: string[] = [];
      for (let node = labelEl.nextSibling; node; node = node.nextSibling) {
        if (node.type === "tag") {
          const tag = (node as Element).tagName?.toLowerCase();
          // A structural boundary starts the description or a new section
          if (tag === "div" || tag === "table" || tag === "h2" || tag === "h3") break;
          // The next field's label
          if ((tag === "strong" || tag === "b") && STAT_FIELDS.has(this.$(node).text().trim().replace(/:$/, ""))) break;
          // A <br/> separates fields but carries no text
          if (tag !== "br") {
            const text = this.$(node).text().trim();
            if (text) parts.push(text);
          }
        } else if (isText(node)) {
          const text = node.data.trim();
          if (text) parts.push(text);
        }
      }

      const value = normalizeWs(parts.join(" ").replace(/^:\s*/, "").replace(/,\s*$/, ""));
      if (value) stats.set(rawLabel.replace(/^Targets?( or (?:Area|Targets?))?$/, "Target"), value);
    }
    return stats;
  }

  /** The spell, as its reference stores it: none for a page without a title or a school the rules know. */
  read(): SpellReference["raw"][number] | undefined {
    const name = this.title();
    if (!name) return undefined;

    const slug = this.slug(name);
    const { school, subschool, descriptors } = this.schools();
    if (!isOneOf(school, SPELL_SCHOOLS)) return undefined;

    const stats = this.stats();
    const levelEntries = (stats.get("Level") ?? "")
      .split(",")
      .map((part) => part.trim().match(/^(.+?)\s+(\d+)$/))
      .filter((match) => match !== null)
      .map((match) => ({ className: match[1].trim(), level: parseInt(match[2], 10) }));
    const components = (stats.get("Components") ?? "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

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
      description: this.description(),
    };
  }
}
