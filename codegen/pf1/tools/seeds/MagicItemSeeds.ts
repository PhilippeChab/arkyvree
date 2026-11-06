import { readCost, readVariantAmounts, readWeight } from "@/codegen/pf1/tools/detect/amounts.ts";
import MagicItemBonuses from "@/codegen/pf1/tools/detect/MagicItemBonuses.ts";
import { type BaseKind, MagicItemText } from "@/codegen/pf1/tools/detect/MagicItemText.ts";
import type { MagicItemCategory, MagicItemEntry, MagicItemReference } from "@/codegen/pf1/tools/types/magicItems.ts";
import { bonus } from "@/content/core/builders/customization/modifiers.ts";
import type { Modifier } from "@/content/core/builders/customization/types.ts";
import type { ItemFields, Pf1ItemSeed } from "@/content/pf1/builders/items/types.ts";
import { capitalize } from "@/shared/text.ts";
import type { ItemLocation } from "@/vocabulary/pf1/equipment.ts";
import {
  ITEM_COST_GP,
  ITEM_MADE_OF,
  ITEM_SLOT,
  ITEM_TYPE,
  ITEM_WEIGHT,
  MAGIC_AURA,
  MAGIC_CASTER_LEVEL,
} from "@/vocabulary/pf1/fields/index.ts";

import { Memos } from "./Memos.ts";

/** What a specific weapon, armor or shield takes of its base: the base, its stats over the base's, its modifiers. */
interface BasePart {
  base?: string;
  fields: ItemFields;
  modifiers: Modifier[];
}

/** What a kind of magic item is: the file it's written to, its item type, its base's kind, and its slot without one. */
interface MagicItemKind {
  base?: BaseKind;
  file: keyof MagicItemSeedSets;
  slot: ItemLocation;
  type: string;
}

/** A magic item reference's seeds, by the file each kind is written to. */
export interface MagicItemSeedSets {
  magicArmor: Pf1ItemSeed[];
  magicShields: Pf1ItemSeed[];
  magicWeapons: Pf1ItemSeed[];
  rings: Pf1ItemSeed[];
  rods: Pf1ItemSeed[];
  staffs: Pf1ItemSeed[];
  wondrousItems: Pf1ItemSeed[];
}

/** A magic item's kind, by its category: a magic armor's by its slot (a shield's, "shield"). */
const KINDS: Record<Exclude<MagicItemCategory, "artifact" | "cursed">, MagicItemKind> = {
  armor: { base: "armor", file: "magicArmor", slot: "Armor", type: "Armor" },
  ring: { file: "rings", slot: "Ring", type: "Ring" },
  rod: { file: "rods", slot: "Main Hand", type: "Rod" },
  staff: { file: "staffs", slot: "Two Handed", type: "Staff" },
  weapon: { base: "weapon", file: "magicWeapons", slot: "Main Hand", type: "Weapon" },
  wondrous: { file: "wondrousItems", slot: "Other", type: "Wondrous Item" },
};

/** A magic shield's kind: a magic armor's whose slot is "shield". */
const SHIELD_KIND: MagicItemKind = { base: "shield", file: "magicShields", slot: "Off Hand", type: "Shield" };

/** A stat block's slot, by its words: the location an item worn there is in. */
const SLOTS: Record<string, ItemLocation> = {
  armor: "Armor",
  belt: "Belt",
  body: "Body",
  chest: "Chest",
  eyes: "Eyes",
  feet: "Feet",
  hands: "Hands",
  head: "Head",
  headband: "Headband",
  neck: "Neck",
  ring: "Ring",
  shield: "Off Hand",
  shoulders: "Shoulders",
  wrist: "Wrists",
  wrists: "Wrists",
};

/** The categories a book's magic items are in that aren't seeded: an artifact, a cursed item, which no one crafts. */
const UNSEEDED = new Set<MagicItemCategory>(["artifact", "cursed"]);

/** A variant's note in parentheses ("Lesser", "+1"): none for a name without one. */
function noteOf(listed: string): string | undefined {
  return listed.match(/\(([^)]+)\)$/)?.[1].toLowerCase();
}

/** A stat block's aura as an item's field: "strong transmutation" is "Strong transmutation", "no aura" none. */
function readAura(aura: string | undefined): string | undefined {
  const match = aura?.match(/^(faint|moderate|strong|overwhelming)\b(.*)$/i);
  if (!match) return undefined;
  // Its descriptor in brackets ("[good]") is the school's, not the aura's
  return capitalize(`${match[1].toLowerCase()}${match[2].replace(/\s*\[[^\]]*\]/g, "")}`.trim());
}

/** A variant's name as a seed's: its bonus in parentheses written after it ("Cloak of Resistance (+1)" is "… +1"). */
function variantName(listed: string): string {
  return listed.replace(/\s*\((\+\d+)\)$/, " $1");
}

/**
 * A magic item reference's seeds, by kind (`seeds`): each magic item a seed per variant its book lists (`listedAs`:
 * "Cloak of Resistance (+1)" is "Cloak of Resistance +1"), priced, weighed and given its caster level as its stat block
 * gives that variant, with its aura, its slot, and the modifiers it gives while worn or held (`MagicItemBonuses`). A
 * specific weapon, armor or shield is made from the base item its text names (its `madeFrom` link), with the stats and
 * the enhancement its text gives (`MagicItemText`). An artifact and a cursed item aren't seeded, nor a weapon's, an
 * armor's or a shield's special ability ("Flaming", a stat block's "weapon quality"), which is no item of its own.
 */
export class MagicItemSeeds {
  constructor(
    readonly ref: MagicItemReference,
    /** The weight of each base weapon, armor and shield, by name: what an item made from one weighs, its own aside. */
    private readonly baseWeights: Record<string, number>,
  ) {}

  /** What it built, by what it is. */
  private readonly memos = new Memos();

  /** A specific weapon's, armor's or shield's part from its base: its link, its stats and its enhancement. */
  private basePart(entry: MagicItemEntry, kind: MagicItemKind): BasePart {
    const text = new MagicItemText(entry.description);
    const base = kind.base && text.baseItem(entry.name, kind.base);
    if (!kind.base || !base) return { fields: {}, modifiers: [] };
    const material = text.material(entry.name);
    const materialFields: ItemFields = material ? { [ITEM_MADE_OF]: material } : {};
    if (kind.base === "weapon") {
      const enhancement = text.weaponEnhancement();
      const modifiers: Modifier[] = [
        ...(enhancement?.attack ? [bonus("weapon.tohit.magic", enhancement.attack)] : []),
        ...(enhancement?.damage ? [bonus("weapon.damage.magic", enhancement.damage)] : []),
      ];
      return { base, fields: materialFields, modifiers };
    }
    const stats = text.armorStats();
    const target = kind.base === "armor" ? "combat.ac.armor" : "combat.ac.shield";
    return {
      base,
      fields: { ...stats.fields, ...materialFields },
      modifiers: stats.enhancement ? [bonus(target, stats.enhancement)] : [],
    };
  }

  /** A magic item's kind: none for one that isn't seeded (an artifact, a cursed item, a special ability). */
  private kindOf(entry: MagicItemEntry): MagicItemKind | undefined {
    if (UNSEEDED.has(entry.category) || /quality/.test(entry.fields.Slot ?? "")) return undefined;
    if (entry.category === "armor" && entry.fields.Slot === "shield") return SHIELD_KIND;
    return KINDS[entry.category as keyof typeof KINDS];
  }

  /** A magic item's seeds: one per variant its book lists. */
  private seedsOf(entry: MagicItemEntry, kind: MagicItemKind): Pf1ItemSeed[] {
    const { fields: statBlock } = entry;
    const prices = readVariantAmounts(statBlock.Price ?? "");
    const levels = readVariantAmounts(statBlock.CL ?? "");
    const aura = readAura(statBlock.Aura);
    const slot = SLOTS[(statBlock.Slot ?? "").toLowerCase()] ?? kind.slot;
    const { base, fields, modifiers } = this.basePart(entry, kind);
    const ownWeight = readWeight(statBlock.Weight ?? "");
    const weight = ownWeight || (base ? this.baseWeights[base] : undefined) || 0;
    return entry.listedAs.map((listed) => {
      const note = noteOf(listed);
      const name = variantName(listed);
      const level = Number(((note && levels.get(note)) ?? statBlock.CL ?? "").match(/^(\d+)/)?.[1] ?? 0);
      const bonuses = new MagicItemBonuses(name, entry.description).modifiers();
      const all = [...modifiers, ...bonuses.filter(({ target }) => !modifiers.some((m) => m.target === target))];
      return {
        name,
        description: entry.description,
        fields: {
          [ITEM_COST_GP]: readCost((note && prices.get(note)) ?? statBlock.Price ?? ""),
          [ITEM_WEIGHT]: weight,
          [ITEM_TYPE]: kind.type,
          [ITEM_SLOT]: slot,
          ...fields,
          ...(level ? { [MAGIC_CASTER_LEVEL]: level } : {}),
          ...(aura ? { [MAGIC_AURA]: [aura] } : {}),
        },
        ...(base ? { links: { madeFrom: base } } : {}),
        ...(all.length > 0 ? { modifiers: all } : {}),
      };
    });
  }

  /** Its magic items left out, each "category: name": its artifacts, its cursed items, its special abilities. */
  leftOut(): string[] {
    return this.ref.raw.filter((entry) => !this.kindOf(entry)).map((entry) => `${entry.category}: ${entry.name}`);
  }

  /** Its seeds, by the file each kind is written to. */
  seeds(): MagicItemSeedSets {
    return this.memos.of("seeds", () => {
      const sets: MagicItemSeedSets = {
        magicArmor: [],
        magicShields: [],
        magicWeapons: [],
        rings: [],
        rods: [],
        staffs: [],
        wondrousItems: [],
      };
      for (const entry of this.ref.raw) {
        const kind = this.kindOf(entry);
        if (kind) sets[kind.file].push(...this.seedsOf(entry, kind));
      }
      return sets;
    });
  }

  /** Its specific weapons, armor and shields made from no base item its vocabulary has, by name. */
  unbased(): string[] {
    return this.ref.raw
      .filter((entry) => {
        const kind = this.kindOf(entry);
        return kind?.base && !new MagicItemText(entry.description).baseItem(entry.name, kind.base);
      })
      .map((entry) => entry.name);
  }
}
