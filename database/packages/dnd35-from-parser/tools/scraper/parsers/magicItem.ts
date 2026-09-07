import * as cheerio from "cheerio";
import type { MagicItemCategory, MagicItemReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";

type RawMagicItem = MagicItemReference["raw"][number];

function normalizeWs(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CheerioEl = cheerio.Cheerio<any>;

function findH4ByText($: cheerio.CheerioAPI, text: string): CheerioEl | null {
  let found: CheerioEl | null = null;
  $("h4").each((_, el) => {
    if (normalizeWs($(el).text()).toLowerCase().includes(text.toLowerCase())) {
      found = $(el) as CheerioEl;
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
 * Shared helper: extract item entries from h5 elements after a given h4 start point.
 */
function parseItemEntries(
  $: cheerio.CheerioAPI,
  startH4Text: string,
  category: MagicItemCategory,
): RawMagicItem[] {
  const startEl = findH4ByText($, startH4Text);
  if (!startEl) return [];

  const items: RawMagicItem[] = [];
  let current = startEl.next();

  while (current.length) {
    const tag = current.prop("tagName")?.toLowerCase();
    if (tag === "h4" || tag === "h3") break;

    if (tag === "h5") {
      const name = normalizeWs(current.text());
      const descParts: string[] = [];
      const charges: { spell: string; charges: number }[] = [];
      let metadataText = "";

      let sibling = current.next();
      while (sibling.length) {
        const sibTag = sibling.prop("tagName")?.toLowerCase();
        if (sibTag === "h5" || sibTag === "h4" || sibTag === "h3") break;

        if (sibTag === "ul" && !metadataText) {
          // Spell charges (staffs): <li>Spell Name (N charges)</li>
          sibling.find("li").each((_, li) => {
            const text = normalizeWs($(li).text());
            const chargeMatch = text.match(/^(.+?)\s*\((\d+)\s*charges?\)/i);
            if (chargeMatch) {
              charges.push({ spell: chargeMatch[1].trim(), charges: parseInt(chargeMatch[2], 10) });
            }
          });
        } else if (sibTag === "p") {
          const text = normalizeWs(sibling.text());
          if (isMetadataParagraph(text)) {
            metadataText = text;
          } else if (!metadataText && text) {
            descParts.push(text);
          }
        }

        sibling = sibling.next();
      }

      if (name) {
        // Check for variant-priced items
        const variants = parseVariantPrices(metadataText);
        if (variants) {
          for (const v of variants) {
            // If variant contains the base name (e.g., "Greater slaying arrow" for "Slaying Arrow"),
            // use the variant as the full name instead of appending
            let variantName: string;
            if (v.variant.toLowerCase().includes(name.toLowerCase())) {
              variantName = v.variant;
            } else {
              const sep = v.variant.startsWith("+") ? " " : ", ";
              variantName = `${name}${sep}${v.variant}`;
            }
            items.push({
              name: variantName,
              category,
              description: descParts.join(" "),
              metadataText,
              ...(charges.length > 0 ? { spellCharges: charges } : {}),
            });
          }
        } else {
          items.push({
            name,
            category,
            description: descParts.join(" "),
            metadataText,
            ...(charges.length > 0 ? { spellCharges: charges } : {}),
          });
        }
      }

      current = sibling;
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
 * Fallback: parse all h5 entries on the page (for pages without a clear section h4).
 */
function parseAllH5Entries($: cheerio.CheerioAPI, category: MagicItemCategory): RawMagicItem[] {
  const items: RawMagicItem[] = [];

  $("h5").each((_, el) => {
    const h5 = $(el);
    const name = normalizeWs(h5.text());
    const descParts: string[] = [];
    const charges: { spell: string; charges: number }[] = [];
    let metadataText = "";

    let sibling = h5.next();
    while (sibling.length) {
      const sibTag = sibling.prop("tagName")?.toLowerCase();
      if (sibTag === "h5" || sibTag === "h4" || sibTag === "h3") break;

      if (sibTag === "ul" && !metadataText) {
        sibling.find("li").each((_, li) => {
          const text = normalizeWs($(li).text());
          const chargeMatch = text.match(/^(.+?)\s*\((\d+)\s*charges?\)/i);
          if (chargeMatch) {
            charges.push({ spell: chargeMatch[1].trim(), charges: parseInt(chargeMatch[2], 10) });
          }
        });
      } else if (sibTag === "p") {
        const text = normalizeWs(sibling.text());
        if (isMetadataParagraph(text)) {
          metadataText = text;
        } else if (!metadataText && text) {
          descParts.push(text);
        }
      }

      sibling = sibling.next();
    }

    if (name && metadataText) {
      const variants = parseVariantPrices(metadataText);
      if (variants) {
        for (const v of variants) {
          let variantName: string;
          if (v.variant.toLowerCase().includes(name.toLowerCase())) {
            variantName = v.variant;
          } else {
            const sep = v.variant.startsWith("+") ? " " : ", ";
            variantName = `${name}${sep}${v.variant}`;
          }
          items.push({
            name: variantName,
            category,
            description: descParts.join(" "),
            metadataText,
            ...(charges.length > 0 ? { spellCharges: charges } : {}),
          });
        }
      } else {
        items.push({
          name,
          category,
          description: descParts.join(" "),
          metadataText,
          ...(charges.length > 0 ? { spellCharges: charges } : {}),
        });
      }
    }
  });

  return items;
}
