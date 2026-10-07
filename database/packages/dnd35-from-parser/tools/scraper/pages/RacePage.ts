/**
 * A race's page on dndtools.net (`/races/{book}/{slug}/`):
 *   <h2>Race Name</h2>
 *   <h3>Attributes</h3>
 *     <table> Size, Base speed, ability scores, Favored Classes
 *   <h3>Description</h3> <p>...</p>
 *   <h3>Racial Traits</h3> <ul><li>...</li></ul>
 */

import { normalizeWs, PART_SEPARATOR } from "@/database/packages/dnd35-from-parser/tools/text/scrapedText.ts";
import type { RaceReference } from "@/database/packages/dnd35-from-parser/tools/types/races.ts";
import type { NamedText } from "@/database/packages/dnd35-from-parser/tools/types/reference.ts";
import { ABILITY_NAMES } from "@/database/packages/dnd35-from-parser/tools/vocabulary/abilities.ts";
import { SIZE_OPTIONS, type SizeType } from "@/shared/enums.ts";

import { DndToolsPage } from "./DndToolsPage.ts";
import { Page } from "./Page.ts";

/** dndtools' Django ids of the sizes, for its "RaceSize object (N)" rendering: the site's keys, not ours. */
const DNDTOOLS_SIZE_IDS: Record<string, SizeType> = {
  "1": "Fine",
  "2": "Diminutive",
  "3": "Tiny",
  "4": "Small",
  "5": "Medium",
  "6": "Large",
  "7": "Huge",
  "8": "Gargantuan",
  "9": "Colossal",
};

/** The control character the SRD's race pages open each trait with: read as the part separator it stands for. */
const PAGE_TRAIT_MARK = "\u0001";

/** An ability adjustment's value: "+2", "−2" (a Unicode minus), "-2", "+0". */
function abilityValue(text: string): number {
  const match = text.replace(/[−–]/g, "-").match(/([+-]?\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/** A trait's name and description: the text before its first colon, else its first sentence, as its name. */
function namedTrait(text: string): NamedText {
  const colonIdx = text.indexOf(":");
  if (colonIdx > 0 && colonIdx < 80)
    return { name: text.substring(0, colonIdx).trim(), description: text.substring(colonIdx + 1).trim() };
  const dotIdx = text.indexOf(".");
  if (dotIdx > 0 && dotIdx < 80)
    return { name: text.substring(0, dotIdx).trim(), description: text.substring(dotIdx + 1).trim() };
  return { name: text.substring(0, 60), description: text };
}

/** A size: one the text names, else the one its dndtools id stands for ("RaceSize object (5)"), else the text. */
function sizeOf(text: string): string {
  for (const s of SIZE_OPTIONS) if (text.toLowerCase().includes(s.toLowerCase())) return s;
  const idMatch = text.match(/\((\d+)\)/);
  if (idMatch && DNDTOOLS_SIZE_IDS[idMatch[1]]) return DNDTOOLS_SIZE_IDS[idMatch[1]];
  return text;
}

/** A speed: the text's last number ("RaceSpeedType object (9) 20": the id, then the speed; "20 feet"). */
function speedOf(text: string): number {
  const numbers = [...text.matchAll(/(\d+)/g)].map((m) => parseInt(m[1], 10));
  return numbers.length > 0 ? numbers[numbers.length - 1] : 0;
}

/** A race's page on dndtools.net: its attributes, description and traits. Its frame also heads its listing "Races". */
export class RacePage extends DndToolsPage {
  constructor(html: string) {
    super(html.replaceAll(PAGE_TRAIT_MARK, PART_SEPARATOR), "Races");
  }

  /** The race's attributes: its table's rows of size, base speed, ability adjustments and favored class. */
  private attributes() {
    let size = "";
    let baseSpeed = 0;
    const abilityAdjustments: { ability: string; value: number }[] = [];
    let favoredClass: string | undefined;

    this.$("table tr").each((_, row) => {
      const cells = this.$(row).find("td, th");
      if (cells.length < 2) return;

      const label = this.$(cells[0]).text().trim().replace(/:$/, "");
      const valueCell = this.$(cells[1]);
      const valueText = valueCell.text().trim();

      if (/^Size$/i.test(label)) {
        size = sizeOf(valueText);
      } else if (/base speed/i.test(label)) {
        baseSpeed = speedOf(valueText);
      } else if (ABILITY_NAMES.includes(label)) {
        const value = abilityValue(valueText);
        if (value !== 0) abilityAdjustments.push({ ability: label, value });
      } else if (/^favored class/i.test(label)) {
        const link = valueCell.find("a").first();
        const fc = link.length > 0 ? link.text().trim() : valueText;
        if (fc && !/^any$/i.test(fc)) favoredClass = fc;
      }
    });
    return { size, baseSpeed, abilityAdjustments, favoredClass };
  }

  /** The race's description: the paragraphs of its Description section. */
  private description(): string {
    const descParts: string[] = [];
    const descHeader = this.heading(/^Description/i, ["h3"]);
    for (const el of descHeader.length > 0 ? Page.section(descHeader) : []) {
      const tag = Page.tagName(el);
      if (tag === "p" || tag === "div") {
        const text = el.text().trim();
        if (text) descParts.push(text);
      }
    }
    return normalizeWs(descParts.join(" "));
  }

  /** The race's traits: the items or paragraphs of its Racial Traits section. */
  private traits(): NamedText[] {
    const features: NamedText[] = [];
    const traitsHeader = this.heading(/^Racial Traits/i, ["h3"]);
    for (const el of traitsHeader.length > 0 ? Page.section(traitsHeader) : []) {
      const tag = Page.tagName(el);
      if (tag === "ul" || tag === "ol") {
        el.find("li").each((_, li) => {
          const text = normalizeWs(this.$(li).text());
          if (text) features.push(namedTrait(text));
        });
      } else if (tag === "p") {
        const text = normalizeWs(el.text());
        if (text) features.push(namedTrait(text));
      }
    }
    return features;
  }

  /** The race, as its reference stores it: none for a page without a title. */
  read(): RaceReference["raw"][number] | undefined {
    const name = this.title();
    if (!name) return undefined;

    const { size, baseSpeed, abilityAdjustments, favoredClass } = this.attributes();
    return {
      name,
      description: this.description(),
      size,
      baseSpeed,
      abilityAdjustments,
      ...(favoredClass ? { favoredClass } : {}),
      features: this.traits(),
    };
  }
}
