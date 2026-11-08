import { readCost } from "@/codegen/dnd5/tools/detect/costs.ts";
import { readAbility } from "@/codegen/dnd5/tools/detect/proficiencies.ts";
import { normalizeText } from "@/codegen/dnd5/tools/detect/text.ts";
import { TOOL_CATEGORIES } from "@/codegen/dnd5/tools/terms/items.ts";
import type { ItemEntry, ItemReference } from "@/codegen/dnd5/tools/types/items.ts";
import { TOOL_PROFICIENCIES_POOL } from "@/content/dnd5/builders/aptitudes/names.ts";
import { toolProficiency } from "@/content/dnd5/builders/feats/proficiencies.ts";
import type { FeatSeed } from "@/content/dnd5/builders/feats/types.ts";
import { armorFields, shieldFields, weaponFields } from "@/content/dnd5/builders/items/fields.ts";
import type { Dnd5ItemSeed } from "@/content/dnd5/builders/items/types.ts";
import { isRecord } from "@/shared/isRecord.ts";
import { ARMOR_DEFINITIONS, ARMOR_NAMES } from "@/vocabulary/dnd5/armor.ts";
import {
  FEAT_FAMILY,
  FEAT_GENERATED,
  ITEM_COST_GP,
  ITEM_IS_TEMPLATE,
  ITEM_TYPE,
  ITEM_WEIGHT,
} from "@/vocabulary/dnd5/fields/index.ts";
import { WEAPON_DEFINITIONS, WEAPON_NAMES } from "@/vocabulary/dnd5/weapons.ts";

import type { ToolPicks } from "./classes/ClassProficiencies.ts";
import { Memos } from "./Memos.ts";
import { readOverrideDescription } from "./overrideDescription.ts";

/** A book's mundane items, by the kind each of its item files holds. */
export interface ItemSeedsByKind {
  armor: Dnd5ItemSeed[];
  gear: Dnd5ItemSeed[];
  martialWeapons: Dnd5ItemSeed[];
  shields: Dnd5ItemSeed[];
  simpleWeapons: Dnd5ItemSeed[];
  tools: Dnd5ItemSeed[];
}

/** The categories that say what an item is no more than its kind does: a gear's, a tool's, ammunition's. */
const PLAIN_CATEGORIES = ["Adventuring Gear", "Ammunition", ...TOOL_CATEGORIES];

/**
 * An item's description past a weapon's and an armor's: its text, or, for an item without one, what its entry gives
 * (its kinds, a pack's contents, ammunition's bundle, a tool's uses), else its name.
 */
function describe(entry: ItemEntry): string {
  if (entry.description) return normalizeText(entry.description);
  const contents = (entry.contents ?? []).flatMap((content) =>
    isRecord(content) && isRecord(content.item) && typeof content.item.name === "string"
      ? [`${Number(content.quantity) > 1 ? `${content.quantity} ` : ""}${content.item.name}`]
      : [],
  );
  const kinds = kindsOf(entry);
  const parts = [
    ...(kinds.length > 0 ? [`Kind: ${kinds.join(", ")}.`] : []),
    ...(contents.length > 0 ? [`Contains: ${contents.join(", ")}.`] : []),
    ...(entry.quantity && entry.storage
      ? [`Ammunition: a bundle of ${entry.quantity}, stored in a ${entry.storage.name}.`]
      : []),
    ...describeTool(entry),
  ];
  return parts.length > 0 ? parts.join("\n") : entry.name;
}

/**
 * An armor's description, the Shield's too: ours (its overrides'), and how long it takes to put on and take off,
 * as the Armor table gives it. Its Armor Class, Strength and Stealth are its fields.
 */
function describeArmor(entry: ItemEntry): string {
  return [
    readOverrideDescription(entry, "armor"),
    ...(entry.don_time && entry.doff_time
      ? [`Takes ${entry.don_time} to put on, ${entry.doff_time} to take off.`]
      : []),
  ].join(" ");
}

/** A tool's uses, as its description gives them: its ability, what it's used for and its DCs, what it crafts. */
function describeTool(entry: ItemEntry): string[] {
  const uses = (entry.utilize ?? []).flatMap((use) => {
    if (!isRecord(use) || typeof use.name !== "string") return [];
    const dc = isRecord(use.dc) && typeof use.dc.dc_value === "number" ? ` (DC ${use.dc.dc_value})` : "";
    return [`${use.name}${dc}`];
  });
  return [
    ...(entry.ability ? [`Ability: ${readAbility(entry.ability.name)}.`] : []),
    ...(uses.length > 0 ? [`Utilize: ${uses.join("; ")}.`] : []),
    ...(entry.craft?.length ? [`Craft: ${entry.craft.map(({ name }) => name).join(", ")}.`] : []),
  ];
}

/**
 * A weapon's description: ours (its overrides'), and the Weapons table's notes (a Lance's "Two-handed unless
 * mounted"). Its damage, properties and mastery are its fields.
 */
function describeWeapon(entry: ItemEntry): string {
  return [readOverrideDescription(entry, "weapon"), ...(entry.notes ?? []).map((note) => `${note}.`)].join(" ");
}

/** Whether an item is of the equipment category `category`. */
function isOf({ equipment_categories }: ItemEntry, category: string): boolean {
  return equipment_categories.some(({ name }) => name === category);
}

/** An item's categories past its kind ("Arcane Foci": Arcane Focus), each as one item of it is named. */
function kindsOf({ equipment_categories }: ItemEntry): string[] {
  return equipment_categories
    .map(({ name }) => name)
    .filter((name) => !PLAIN_CATEGORIES.includes(name))
    .map((name) => (name.endsWith(" Foci") ? name.replace(/Foci$/, "Focus") : name.replace(/s$/, "")));
}

/**
 * An item reference's seeds (`seeds`, by kind): its weapons, armor and Shield, templates others are made from, their
 * fields the vocabulary's Weapons and Armor tables' (an item the tables don't have refuses the book); its adventuring
 * gear and ammunition, and its tools (`tools`), each its cost and weight, and its description its text, or what its
 * entry gives (a pack's contents, a tool's uses).
 */
export class ItemSeeds {
  constructor(readonly ref: ItemReference) {}

  /** What's built of the reference, once. */
  private readonly memos = new Memos();

  /** Each item's entry, as its override corrects it (a Trident's damage, Half Plate Armor's name). */
  private entries(): ItemEntry[] {
    return this.ref.raw
      .map((entry) => ({ ...entry, ...this.ref.overrides?.[entry.name] }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** An item other than a template: its type (a tool, or another), its cost and weight, its description. */
  private item(entry: ItemEntry, type: "Other" | "Tool"): Dnd5ItemSeed {
    return {
      name: entry.name,
      description: describe(entry),
      fields: { [ITEM_TYPE]: type, [ITEM_COST_GP]: readCost(entry.cost), [ITEM_WEIGHT]: entry.weight ?? 0 },
    };
  }

  /** Refuses templates other than the tables' weapons and armor: an entry they don't have, or one they do it lacks. */
  private refuseOthers({ simpleWeapons, martialWeapons, armor }: ItemSeedsByKind) {
    const names = (seeds: Dnd5ItemSeed[]) => seeds.map(({ name }) => name).sort();
    const weapons = names([...simpleWeapons, ...martialWeapons]);
    if (weapons.join() !== WEAPON_NAMES.join())
      throw new Error(`The weapons aren't the Weapons table's: ${weapons.join(", ")}`);
    if (names(armor).join() !== ARMOR_NAMES.join())
      throw new Error(`The armor isn't the Armor table's: ${names(armor).join(", ")}`);
  }

  /** A template: a weapon's, an armor's or the Shield's, its fields the tables' (`weaponFields`…). */
  private template(entry: ItemEntry): Dnd5ItemSeed {
    const { name } = entry;
    if (isOf(entry, "Weapons")) {
      if (!WEAPON_DEFINITIONS[name]) throw new Error(`${name}: a weapon the Weapons table doesn't have`);
      return {
        name,
        description: describeWeapon(entry),
        fields: { [ITEM_IS_TEMPLATE]: true, ...weaponFields(name) },
      };
    }
    if (isOf(entry, "Shields"))
      return { name, description: describeArmor(entry), fields: { [ITEM_IS_TEMPLATE]: true, ...shieldFields() } };

    if (!ARMOR_DEFINITIONS[name]) throw new Error(`${name}: an armor the Armor table doesn't have`);
    return {
      name,
      description: describeArmor(entry),
      fields: { [ITEM_IS_TEMPLATE]: true, ...armorFields(name) },
    };
  }

  /** Its items, by kind: each its reference's, sorted by name, its weapons and armor the tables' every one. */
  seeds(): ItemSeedsByKind {
    return this.memos.of("seeds", () => {
      const seeds: ItemSeedsByKind = {
        simpleWeapons: [],
        martialWeapons: [],
        armor: [],
        shields: [],
        gear: [],
        tools: [],
      };
      for (const entry of this.entries()) {
        if (isOf(entry, "Simple Weapons")) seeds.simpleWeapons.push(this.template(entry));
        else if (isOf(entry, "Martial Weapons")) seeds.martialWeapons.push(this.template(entry));
        else if (isOf(entry, "Shields")) seeds.shields.push(this.template(entry));
        else if (isOf(entry, "Armor")) seeds.armor.push(this.template(entry));
        else if (TOOL_CATEGORIES.some((category) => isOf(entry, category))) seeds.tools.push(this.item(entry, "Tool"));
        else seeds.gear.push(this.item(entry, "Other"));
      }
      this.refuseOthers(seeds);
      return seeds;
    });
  }

  /**
   * Each of its tools' proficiency's feat, in the pool of every tool's proficiency, and in each pool of tools a class or
   * a background picks one among that lists it (`picks`).
   */
  toolFeats(picks: ToolPicks[]): FeatSeed[] {
    return this.tools().map((tool) => ({
      name: toolProficiency(tool),
      description: `You add your Proficiency Bonus to checks with ${tool}.`,
      aptitudes: [
        TOOL_PROFICIENCIES_POOL,
        ...picks.filter(({ tools }) => tools.includes(tool)).map(({ pool }) => pool),
      ],
      fields: { [FEAT_GENERATED]: true, [FEAT_FAMILY]: ["Tool Proficiency"] },
    }));
  }

  /** Its tools' names, which a proficiency names (a rogue's Thieves' Tools, a soldier's Gaming Set). */
  tools(): string[] {
    return this.seeds().tools.map(({ name }) => name);
  }
}
