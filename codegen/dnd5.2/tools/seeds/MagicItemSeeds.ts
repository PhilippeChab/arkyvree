import { readBaseItems, readRarity } from "@/codegen/dnd5.2/tools/detect/magicItems.ts";
import { normalizeText } from "@/codegen/dnd5.2/tools/detect/text.ts";
import { ENHANCED_FAMILIES, type ItemType, MAGIC_ITEM_TYPES, WORN_SLOTS } from "@/codegen/dnd5.2/tools/terms/items.ts";
import type { MagicItemEntry, MagicItemReference } from "@/codegen/dnd5.2/tools/types/magicItems.ts";
import { bonus } from "@/content/core/builders/customization/modifiers.ts";
import type { Modifier } from "@/content/core/builders/customization/types.ts";
import type { Dnd52ItemSeed, ItemFields } from "@/content/dnd5.2/builders/items/types.ts";
import { ARMOR_NAMES } from "@/vocabulary/dnd5.2/armor.ts";
import { ITEM_TYPE_LOCATIONS } from "@/vocabulary/dnd5.2/equipment.ts";
import { ITEM_ATTUNEMENT, ITEM_RARITY, ITEM_SLOT, ITEM_TYPE } from "@/vocabulary/dnd5.2/fields/index.ts";
import { ITEM_RARITIES } from "@/vocabulary/dnd5.2/itemTemplates.ts";
import { WEAPON_NAMES } from "@/vocabulary/dnd5.2/weapons.ts";

import { Memos } from "./Memos.ts";

/** A book's magic items, by the kind each of its item files holds. */
export interface MagicItemSeedsByKind {
  magicAmmunition: Dnd52ItemSeed[];
  magicArmor: Dnd52ItemSeed[];
  magicShields: Dnd52ItemSeed[];
  magicWeapons: Dnd52ItemSeed[];
  potions: Dnd52ItemSeed[];
  rings: Dnd52ItemSeed[];
  rods: Dnd52ItemSeed[];
  scrolls: Dnd52ItemSeed[];
  staffs: Dnd52ItemSeed[];
  wands: Dnd52ItemSeed[];
  wondrousItems: Dnd52ItemSeed[];
}

/** The kind of file each item type's magic items are in. */
const KINDS: Record<ItemType, keyof MagicItemSeedsByKind> = {
  Armor: "magicArmor",
  Shield: "magicShields",
  Weapon: "magicWeapons",
  Potion: "potions",
  Ring: "rings",
  Rod: "rods",
  Scroll: "scrolls",
  Staff: "staffs",
  Wand: "wands",
  "Wondrous Item": "wondrousItems",
  Tool: "wondrousItems",
  Other: "magicAmmunition",
};

/** The templates each family of enhanced items is made of, by its type. */
const TEMPLATES: Record<"Armor" | "Shield" | "Weapon", readonly string[]> = {
  Armor: ARMOR_NAMES,
  Shield: ["Shield"],
  Weapon: WEAPON_NAMES,
};

/**
 * An enhanced item's modifiers, by its type and its bonus: a weapon's to hit and damage, an armor's Armor Class, a
 * Shield's on its own part of it (`combat.ac.shield`, as 3.5's), which needs Shield training as the Shield's +2 does.
 */
function enhancement(type: "Armor" | "Shield" | "Weapon", plus: number): Modifier[] {
  if (type === "Weapon") return [bonus("weapon.tohit.magic", plus), bonus("weapon.damage.magic", plus)];
  return [bonus(type === "Shield" ? "combat.ac.shield" : "combat.ac.misc", plus)];
}

/** A rarity line a variant's text opens on past its type's ("Uncommon (+1)", "Rare (Silver)"). */
function isRarityLine(line: string): boolean {
  return ITEM_RARITIES.some((rarity) => line === rarity || line.startsWith(`${rarity} (`));
}

/** The slot a magic item of `type` is worn or held in, by its type or a word of its name: none to carry it. */
function slotOf(type: ItemType, name: string) {
  if (type === "Ring") return "Ring";
  if (type === "Armor" || type === "Shield") return ITEM_TYPE_LOCATIONS[type][0];
  return type === "Wondrous Item" ? WORN_SLOTS.find(([word]) => word.test(name))?.[1] : undefined;
}

/**
 * A magic item reference's seeds (`seeds`, by kind), each read off its entry as its override corrects it: its type
 * (its category's; a Shield's, its first line's; ammunition's, no weapon's), its rarity, whether it takes attunement,
 * the slot it's worn in, the template it's made from (the one item its first line names: "Weapon (Longsword)"), and
 * its description, its text past its type's and rarity's lines. A family the database gives under one name with its
 * variants (Horn of Valhalla) is its variants, and a +1, +2 or +3 weapon, armor or Shield a variant made of each
 * template of its type ("Longsword +1"), with its bonus; the families are left out (`leftOut`).
 */
export class MagicItemSeeds {
  constructor(readonly ref: MagicItemReference) {}

  /** What's built of the reference, once. */
  private readonly memos = new Memos();

  /**
   * A magic item's description: its text past its type's line (kept when it names what it's made of and no template
   * says it: "Armor (Chain Mail or Chain Shirt)") and its rarity's, and whom its attunement is limited to.
   */
  private description(entry: MagicItemEntry, made: boolean): string {
    const [first = "", ...lines] = entry.desc;
    const text = [
      ...(!made && first.includes("(") ? [`${first}.`] : []),
      ...(isRarityLine(lines[0] ?? "") ? lines.slice(1) : lines),
    ];
    const attunement = entry["limited-to"] ? [`Requires attunement by a ${entry["limited-to"]}.`] : [];
    return normalizeText([...text, ...attunement].join("\n"));
  }

  /** Its entries, as their overrides correct them. */
  private entries(): MagicItemEntry[] {
    return this.ref.raw.map((entry) => ({ ...entry, ...this.ref.overrides?.[entry.name] }));
  }

  /** A magic item's fields: its type, rarity, attunement and slot. */
  private fields(entry: MagicItemEntry, type: ItemType): ItemFields {
    const rarity = readRarity(entry.rarity.name);
    if (!rarity) throw new Error(`${entry.name}: no rarity is "${entry.rarity.name}"`);
    const slot = slotOf(type, entry.name);
    return {
      [ITEM_TYPE]: type,
      [ITEM_RARITY]: rarity,
      [ITEM_ATTUNEMENT]: entry.attunement,
      ...(slot ? { [ITEM_SLOT]: slot } : {}),
    };
  }

  /** A magic item's seed: its fields, its description, the template it's made from. */
  private seed(entry: MagicItemEntry): Dnd52ItemSeed {
    const type = this.typeOf(entry);
    const bases = readBaseItems(entry.desc[0] ?? "");
    const template = bases.length === 1 ? bases[0] : undefined;
    const known =
      template && (type === "Shield" ? template === "Shield" : [...WEAPON_NAMES, ...ARMOR_NAMES].includes(template));
    return {
      name: entry.name,
      description: this.description(entry, Boolean(known)),
      fields: this.fields(entry, type),
      ...(known ? { links: { madeFrom: template } } : {}),
    };
  }

  /** A magic item's type: its category's, a Shield's when its first line says so, no weapon's for ammunition. */
  private typeOf(entry: MagicItemEntry): ItemType {
    if (entry.desc[0] === "Armor (Shield)") return "Shield";
    if (entry.name.startsWith("Ammunition")) return "Other";
    const type = MAGIC_ITEM_TYPES[entry.equipment_category.name];
    if (!type) throw new Error(`${entry.name}: no item type is the category "${entry.equipment_category.name}"`);
    return type;
  }

  /** An enhanced item's variant, made of each template of its type: "Longsword +1". */
  private variants(entry: MagicItemEntry, type: "Armor" | "Shield" | "Weapon"): Dnd52ItemSeed[] {
    const plus = Number(/\+(\d)$/.exec(entry.name)?.[1]);
    if (!plus) throw new Error(`${entry.name}: an enhanced item without its bonus`);
    return TEMPLATES[type].map((template) => ({
      name: `${template} +${plus}`,
      description: this.description(entry, true),
      fields: this.fields(entry, type),
      links: { madeFrom: template },
      modifiers: enhancement(type, plus),
    }));
  }

  /** The families the database gives under one name with their variants, which are their items. */
  leftOut(): string[] {
    return this.entries()
      .filter(({ variants }) => variants.length > 0)
      .map(({ name }) => name);
  }

  /** Its magic items, by kind, each sorted by name. */
  seeds(): MagicItemSeedsByKind {
    return this.memos.of("seeds", () => {
      const entries = this.entries();
      const enhanced = new Map(
        entries.flatMap(({ name, variants }) => {
          const type = ENHANCED_FAMILIES[name];
          return type ? variants.map((variant): [string, typeof type] => [variant.name, type]) : [];
        }),
      );
      const typed = entries
        .filter(({ variants }) => variants.length === 0)
        .flatMap((entry): [ItemType, Dnd52ItemSeed][] => {
          const type = enhanced.get(entry.name);
          if (type) return this.variants(entry, type).map((seed) => [type, seed]);
          return [[this.typeOf(entry), this.seed(entry)]];
        });
      const byKind: MagicItemSeedsByKind = {
        magicAmmunition: [],
        magicArmor: [],
        magicShields: [],
        magicWeapons: [],
        potions: [],
        rings: [],
        rods: [],
        scrolls: [],
        staffs: [],
        wands: [],
        wondrousItems: [],
      };
      for (const [type, seed] of typed.sort(([, a], [, b]) => a.name.localeCompare(b.name)))
        byKind[KINDS[type]].push(seed);
      return byKind;
    });
  }
}
