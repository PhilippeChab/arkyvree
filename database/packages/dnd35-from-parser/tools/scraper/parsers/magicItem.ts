import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import { sectionElements, tagOf } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/page.ts";
import { normalizeWs } from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import type { MagicItemCategory, MagicItemReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";

type RawMagicItem = MagicItemReference["raw"][number];

type CheerioEl = cheerio.Cheerio<AnyNode>;

function findH4ByText($: cheerio.CheerioAPI, text: string): CheerioEl | null {
  let found: CheerioEl | null = null;
  $("h4").each((_, el) => {
    if (normalizeWs($(el).text()).toLowerCase().includes(text.toLowerCase())) {
      found = $(el);
      return false;
    }
  });
  return found;
}

/**
 * Detect whether a paragraph is a metadata paragraph (contains "Price" with gp amount).
 */
function isMetadataParagraph(text: string): boolean {
  return /Price\s+[\d,]+\s*gp/i.test(text);
}

/**
 * Detect variant-priced items: "Price 2,000 gp (ring +1); 8,000 gp (ring +2); ..."
 * Returns array of { price, variant } if multiple variants found, otherwise null.
 * Variant labels are cleaned to just the distinguishing part (e.g., "ring +1" → "+1").
 */
function parseVariantPrices(metadataText: string): { price: string; variant: string }[] | null {
  const priceMatch = metadataText.match(/Price\s+(.+?)\.?\s*$/i);
  if (!priceMatch) return null;

  const priceSection = priceMatch[1];
  // Match pattern: "X gp (variant)" repeated with semicolons
  const variantPattern = /([\d,]+)\s*gp\s*\(([^)]+)\)/g;
  const variants: { price: string; variant: string }[] = [];
  let match: RegExpExecArray | null;

  while ((match = variantPattern.exec(priceSection)) !== null) {
    let variant = match[2].trim();
    // Strip category prefix from variant tag (e.g., "ring +1" → "+1")
    variant = variant.replace(/^(?:ring|armor|shield|weapon)\s+/i, "");
    // Title-case text variants (e.g., "lesser" → "Lesser", "greater slaying arrow" → "Greater Slaying Arrow")
    if (variant && !variant.startsWith("+")) {
      variant = variant.replace(/\b\w/g, (c) => c.toUpperCase());
    }
    variants.push({ price: match[1].replace(/,/g, ""), variant });
  }

  return variants.length > 1 ? variants : null;
}

/**
 * An item's block, after its h5 heading up to the next heading: its description paragraphs, its metadata paragraph
 * (its price…), and a staff's spells with their charges.
 */
function readItemBlock($: cheerio.CheerioAPI, heading: CheerioEl) {
  const descParts: string[] = [];
  const charges: { spell: string; charges: number }[] = [];
  let metadataText = "";

  const section = sectionElements(heading, ["h3", "h4", "h5"]);
  for (const sibling of section) {
    const tag = tagOf(sibling);
    if (tag === "ul" && !metadataText) {
      // Spell charges (staffs): <li>Spell Name (N charges)</li>
      sibling.find("li").each((_, li) => {
        const text = normalizeWs($(li).text());
        const chargeMatch = text.match(/^(.+?)\s*\((\d+)\s*charges?\)/i);
        if (chargeMatch) {
          charges.push({ spell: chargeMatch[1].trim(), charges: parseInt(chargeMatch[2], 10) });
        }
      });
    } else if (tag === "p") {
      const text = normalizeWs(sibling.text());
      if (isMetadataParagraph(text)) {
        metadataText = text;
      } else if (!metadataText && text) {
        descParts.push(text);
      }
    }
  }

  // Where the next block starts: the heading ending this one
  const end = (section.at(-1) ?? heading).next();
  return { name: normalizeWs(heading.text()), description: descParts.join(" "), metadataText, charges, end };
}

/**
 * An item block's entries: one for each price of a variant-priced item, named after its variant ("+1", "Greater"…,
 * or the variant alone when it contains the item's name: "Greater slaying arrow"), else one.
 */
function itemEntries(block: ReturnType<typeof readItemBlock>, category: MagicItemCategory): RawMagicItem[] {
  const { name, description, metadataText, charges } = block;
  const entry = (entryName: string): RawMagicItem => ({
    name: entryName,
    category,
    description,
    metadataText,
    ...(charges.length > 0 ? { spellCharges: charges } : {}),
  });
  const variants = parseVariantPrices(metadataText);
  if (!variants) return [entry(name)];
  return variants.map(({ variant }) =>
    entry(
      variant.toLowerCase().includes(name.toLowerCase())
        ? variant
        : `${name}${variant.startsWith("+") ? " " : ", "}${variant}`,
    ),
  );
}

/** The items of the section after the h4 heading `startH4Text`: an h5 heading each. */
function parseItemEntries($: cheerio.CheerioAPI, startH4Text: string, category: MagicItemCategory): RawMagicItem[] {
  const startEl = findH4ByText($, startH4Text);
  if (!startEl) return [];

  const items: RawMagicItem[] = [];
  let current = startEl.next();
  while (current.length) {
    const tag = tagOf(current);
    if (tag === "h4" || tag === "h3") break;
    if (tag === "h5") {
      const block = readItemBlock($, current);
      if (block.name) items.push(...itemEntries(block, category));
      current = block.end;
      continue;
    }
    current = current.next();
  }
  return items;
}

// ---------------------------------------------------------------------------
// Page-specific parsers
// ---------------------------------------------------------------------------

export function parseMagicArmorHtml(html: string): RawMagicItem[] {
  const $ = cheerio.load(html);
  return parseItemEntries($, "Specific Armors", "specificArmor");
}

export function parseMagicShieldsHtml(html: string): RawMagicItem[] {
  const $ = cheerio.load(html);
  return parseItemEntries($, "Specific Shields", "specificShield");
}

export function parseMagicWeaponsHtml(html: string): RawMagicItem[] {
  const $ = cheerio.load(html);
  return parseItemEntries($, "Specific Weapons", "specificWeapon");
}

export function parseRingsHtml(html: string): RawMagicItem[] {
  const $ = cheerio.load(html);
  return parseItemEntries($, "Ring Descriptions", "ring");
}

export function parseRodsHtml(html: string): RawMagicItem[] {
  const $ = cheerio.load(html);
  return parseItemEntries($, "Rod Descriptions", "rod");
}

export function parseStaffsHtml(html: string): RawMagicItem[] {
  const $ = cheerio.load(html);
  return parseItemEntries($, "Staff Descriptions", "staff");
}

/**
 * Fallback: parse all h5 entries on the page (for pages without a clear section h4), those with a price only.
 */
function parseAllH5Entries($: cheerio.CheerioAPI, category: MagicItemCategory): RawMagicItem[] {
  const items: RawMagicItem[] = [];
  $("h5").each((_, el) => {
    const block = readItemBlock($, $(el));
    if (block.name && block.metadataText) items.push(...itemEntries(block, category));
  });
  return items;
}

export function parseWondrousItemsHtml(html: string): RawMagicItem[] {
  const $ = cheerio.load(html);
  // Try "Wondrous Item Descriptions" first, then fall back to "Item Descriptions"
  let items = parseItemEntries($, "Wondrous Item Descriptions", "wondrousItem");
  if (items.length === 0) {
    items = parseItemEntries($, "Item Descriptions", "wondrousItem");
  }
  if (items.length === 0) {
    // Fallback: parse all h5 entries on the page after any table
    items = parseAllH5Entries($, "wondrousItem");
  }
  return items;
}
