/** What a magic item's metadata line says of it: its aura, caster level, price and weight; and its type and slot. */

import type {
  MagicItemCategory,
  MagicItemReference,
} from "@/database/packages/dnd35-from-parser/tools/types/magicItems.ts";

import { readCost, readWeight } from "./amounts.ts";

/** What a magic item's metadata says of it, and what its category and name make it. */
type MagicItemMetadata = Pick<
  MagicItemReference["detected"][string],
  "aura" | "casterLevel" | "costGp" | "itemType" | "slot" | "weight"
>;

const CATEGORY_SLOT_MAP: Partial<Record<MagicItemCategory, string>> = {
  ring: "Finger",
  staff: "Two Handed",
  rod: "Main Hand",
  specificArmor: "Torso",
  specificShield: "Off Hand",
  specificWeapon: "Main Hand",
};

const CATEGORY_TYPE_MAP: Record<MagicItemCategory, string> = {
  specificArmor: "Armor",
  specificShield: "Shield",
  specificWeapon: "Weapon",
  wondrousItem: "Wondrous Item",
  ring: "Ring",
  rod: "Rod",
  staff: "Staff",
};

const WONDROUS_SLOT_PATTERNS: [RegExp, string][] = [
  [/\b(?:Belt|Girdle)\b/i, "Waist"],
  [/\b(?:Cloak|Cape|Mantle)\b/i, "Shoulders"],
  [/\b(?:Helm|Crown|Circlet|Headband|Phylactery|Hat|Goggles|Eyes|Lenses)\b/i, "Head"],
  [/\b(?:Amulet|Necklace|Periapt|Medallion|Scarab|Brooch)\b/i, "Neck"],
  [/\b(?:Bracers|Bracelet)\b/i, "Wrists"],
  [/\b(?:Gauntlets?|Gloves?)\b/i, "Hands"],
  [/\b(?:Robe|Vest)\b/i, "Torso"],
  [/\b(?:Boots|Slippers|Sandals)\b/i, "Other"],
];

function inferSlot(name: string, category: MagicItemCategory): string {
  if (category !== "wondrousItem") return CATEGORY_SLOT_MAP[category] ?? "Other";

  for (const [pattern, slot] of WONDROUS_SLOT_PATTERNS) if (pattern.test(name)) return slot;

  return "Other";
}

/**
 * Parse all variant prices from metadata text.
 * Returns a map: variant tag → price string, or null if no variants.
 */
function parseAllVariantPrices(metadataText: string): Map<string, string> | null {
  const variantPattern = /([\d,]+)\s*gp\s*\(([^)]+)\)/g;
  const variants = new Map<string, string>();
  let match: RegExpExecArray | null;
  while ((match = variantPattern.exec(metadataText)) !== null) {
    // Strip category prefix and normalize to match cleaned variant names from the parser
    let tag = match[2].trim().replace(/^(?:ring|armor|shield|weapon)\s+/i, "");
    if (tag && !tag.startsWith("+")) tag = tag.replace(/\b\w/g, (c) => c.toUpperCase());

    variants.set(tag, match[1].replace(/,/g, ""));
  }
  return variants.size > 1 ? variants : null;
}

function parseAura(metadataText: string): string | undefined {
  const match = metadataText.match(/(faint|moderate|strong|overwhelming)\s+([\w][\w\s,]+?)(?:;|$)/i);
  if (!match) return undefined;
  const strength = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
  const school = match[2].trim();
  return `${strength} ${school}`;
}

function parseCasterLevel(metadataText: string): number | undefined {
  const match = metadataText.match(/CL\s+(\d+)(?:st|nd|rd|th)/i);
  return match ? parseInt(match[1], 10) : undefined;
}

function parseMetadataPrice(metadataText: string): string {
  // For variant items, the metadata may have multiple prices — we extract the first one
  const match = metadataText.match(/Price\s+([\d,]+)\s*gp/i);
  if (match) return readCost(`${match[1]} gp`);
  return "0";
}

function parseMetadataWeight(metadataText: string): string {
  const match = metadataText.match(/Weight\s+([\d.]+)\s*lb/i);
  if (match) return readWeight(`${match[1]} lb.`);
  return "0";
}

/**
 * The price of a magic item, the variant's when its metadata prices several ("2,000 gp (ring +1)", which the parser
 * appended to the item's name: "Protection +1"), the longest tag the name ends with.
 */
function variantPrice(entry: MagicItemReference["raw"][number]): string {
  const variants = parseAllVariantPrices(entry.metadataText);
  const sortedVariants = [...(variants ?? new Map<string, string>()).entries()].sort(
    (a, b) => b[0].length - a[0].length,
  );
  const price = sortedVariants.find(([tag]) => entry.name.endsWith(tag))?.[1];
  return price ?? parseMetadataPrice(entry.metadataText);
}

/** A magic item's aura, caster level, price and weight, as its metadata gives them, and its type and slot. */
export function readMagicItemMetadata(entry: MagicItemReference["raw"][number]): MagicItemMetadata {
  const aura = parseAura(entry.metadataText);
  const casterLevel = parseCasterLevel(entry.metadataText);
  return {
    ...(aura ? { aura } : {}),
    ...(casterLevel ? { casterLevel } : {}),
    costGp: variantPrice(entry),
    weight: parseMetadataWeight(entry.metadataText),
    itemType: CATEGORY_TYPE_MAP[entry.category],
    slot: inferSlot(entry.name, entry.category),
  };
}
