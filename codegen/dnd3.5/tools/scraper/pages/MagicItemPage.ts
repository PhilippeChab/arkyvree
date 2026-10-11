/** A page of the SRD's magic items on d20srd.org: a section of item descriptions, an h5 heading per item. */

import type * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import { Page } from "@/codegen/core/scraper/Page.ts";
import { normalizeWs } from "@/codegen/core/text/whitespace.ts";
import type { MagicItemCategory, MagicItemReference } from "@/codegen/dnd3.5/tools/types/magicItems.ts";

/** An item's block on the page: its name, description, metadata (its price…), a staff's spells, and where it ends. */
interface ItemBlock {
  charges: { charges: number; spell: string }[];
  description: string;
  end: cheerio.Cheerio<AnyNode>;
  metadataText: string;
  name: string;
}

/** A magic item, as its reference stores it. */
type RawMagicItem = MagicItemReference["raw"][number];

/** Whether a paragraph is an item's metadata: it gives a price in gold pieces. */
function isMetadataParagraph(text: string): boolean {
  return /Price\s+[\d,]+\s*gp/i.test(text);
}

/**
 * The prices of an item sold in variants ("Price 2,000 gp (ring +1); 8,000 gp (ring +2)"), each with its variant's
 * tag cleaned to what tells it apart ("ring +1" → "+1", "greater slaying arrow" → "Greater Slaying Arrow"): none
 * for an item of one price.
 */
function variantPrices(metadataText: string): { price: string; variant: string }[] | undefined {
  const priceSection = metadataText.match(/Price\s+(.+?)\.?\s*$/i)?.[1];
  if (!priceSection) return undefined;
  const variants = [...priceSection.matchAll(/([\d,]+)\s*gp\s*\(([^)]+)\)/g)].map((match) => {
    let variant = match[2].trim().replace(/^(?:ring|armor|shield|weapon)\s+/i, "");
    if (variant && !variant.startsWith("+")) variant = variant.replace(/\b\w/g, (c) => c.toUpperCase());
    return { price: match[1].replace(/,/g, ""), variant };
  });
  return variants.length > 1 ? variants : undefined;
}

/** A page of the SRD's magic items (d20srd.org): the items of its descriptions' section, by category. */
export class MagicItemPage extends Page {
  /**
   * An item block's entries: one for each price of a variant-priced item, named after its variant ("+1",
   * "Greater"…, or the variant alone when it contains the item's name: "Greater slaying arrow"), else one.
   */
  private entries(block: ItemBlock, category: MagicItemCategory): RawMagicItem[] {
    const { name, description, metadataText, charges } = block;
    const entry = (entryName: string): RawMagicItem => ({
      name: entryName,
      category,
      description,
      metadataText,
      ...(charges.length > 0 ? { spellCharges: charges } : {}),
    });
    const variants = variantPrices(metadataText);
    if (!variants) return [entry(name)];
    return variants.map(({ variant }) =>
      entry(
        variant.toLowerCase().includes(name.toLowerCase())
          ? variant
          : `${name}${variant.startsWith("+") ? " " : ", "}${variant}`,
      ),
    );
  }

  /**
   * An item's block, after its h5 heading up to the next heading: its description paragraphs (a line break in one,
   * `<br>`, kept between its lines), its metadata paragraph (its price…), and a staff's spells with their charges.
   */
  private itemBlock(heading: cheerio.Cheerio<AnyNode>): ItemBlock {
    const descParts: string[] = [];
    const charges: { charges: number; spell: string }[] = [];
    let metadataText = "";

    const section = Page.section(heading, ["h3", "h4", "h5"]);
    for (const sibling of section) {
      const tag = Page.tagName(sibling);
      if (tag === "ul" && !metadataText) {
        // A staff's spells: <li>Spell Name (N charges)</li>
        sibling.find("li").each((_, li) => {
          const text = normalizeWs(Page.text(this.$(li)));
          const chargeMatch = text.match(/^(.+?)\s*\((\d+)\s*charges?\)/i);
          if (chargeMatch) charges.push({ spell: chargeMatch[1].trim(), charges: parseInt(chargeMatch[2], 10) });
        });
      } else if (tag === "p") {
        const text = normalizeWs(Page.text(sibling));
        if (isMetadataParagraph(text)) metadataText = text;
        else if (!metadataText && text) descParts.push(text);
      }
    }

    // Where the next block starts: the heading ending this one
    const end = (section.at(-1) ?? heading).next();
    return { name: normalizeWs(heading.text()), description: descParts.join(" "), metadataText, charges, end };
  }

  /** The items of the section after the h4 heading whose text holds `heading` ("Specific Armors"): an h5 each. */
  items(heading: string, category: MagicItemCategory): RawMagicItem[] {
    const start = this.heading(new RegExp(RegExp.escape(heading), "i"), ["h4"]);
    if (start.length === 0) return [];

    const items: RawMagicItem[] = [];
    let current: cheerio.Cheerio<AnyNode> = start.next();
    while (current.length) {
      const tag = Page.tagName(current);
      if (tag === "h4" || tag === "h3") break;
      if (tag === "h5") {
        const block = this.itemBlock(current);
        if (block.name) items.push(...this.entries(block, category));
        current = block.end;
        continue;
      }
      current = current.next();
    }
    return items;
  }

  /**
   * The wondrous items: those of its "Wondrous Item Descriptions" section, else of its "Item Descriptions" one, else
   * every h5 entry of the page that gives a price.
   */
  wondrousItems(): RawMagicItem[] {
    let items = this.items("Wondrous Item Descriptions", "wondrousItem");
    if (items.length === 0) items = this.items("Item Descriptions", "wondrousItem");
    if (items.length > 0) return items;

    this.$("h5").each((_, el) => {
      const block = this.itemBlock(this.$(el));
      if (block.name && block.metadataText) items.push(...this.entries(block, "wondrousItem"));
    });
    return items;
  }
}
