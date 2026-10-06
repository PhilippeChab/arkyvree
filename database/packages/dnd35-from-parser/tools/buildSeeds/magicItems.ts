/** A magic item reference's seeds: its ItemDef[], by category. */

import { readArmorStats } from "@/database/packages/dnd35-from-parser/tools/scraper/armorStats.ts";
import { detectBaseItem } from "@/database/packages/dnd35-from-parser/tools/scraper/detectMagicItem.ts";
import { readWeaponEnhancement } from "@/database/packages/dnd35-from-parser/tools/scraper/weaponStats.ts";
import { checkedValue, checkOneOf, normalizeDescription } from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import { type MagicItemCategory, type MagicItemReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";
import { armorProperties } from "@/database/packages/dnd35/content/items.ts";
import { type ItemDef, type Modifier, type Property } from "@/database/packages/dnd35/content/types.ts";
import { MAGIC_AURA, MAGIC_CASTER_LEVEL } from "@/shared/dnd3.5/properties/index.ts";
import { LOCATION_OPTIONS } from "@/shared/enums.ts";

export type MagicItemSeedSets = {
  magicArmor: ItemDef[];
  magicShields: ItemDef[];
  magicWeapons: ItemDef[];
  wondrousItems: ItemDef[];
  rings: ItemDef[];
  rods: ItemDef[];
  staffs: ItemDef[];
};

/** The specific armor and shields, whose text gives what they change of their base's. */
const ARMOR_CATEGORIES = new Set<MagicItemCategory>(["specificArmor", "specificShield"]);

/** The word a ring's, a rod's or a staff's name holds, prefixed when the SRD heading is just the bare name. */
const CATEGORY_PREFIX: Partial<Record<MagicItemCategory, string>> = { ring: "Ring", rod: "Rod", staff: "Staff" };

/** A weapon's enhancement bonus, as modifiers of the weapon holding it: its attack's and its damage's. */
function weaponEnhancementModifiers(description: string): Modifier[] {
  const enhancement = readWeaponEnhancement(description);
  if (!enhancement) return [];
  const bonus = (target: string, value: number): Modifier[] =>
    value ? [{ target, operator: "add", value: String(value), valueType: "number" }] : [];
  return [...bonus("weapon.tohit.magic", enhancement.attack), ...bonus("weapon.damage.magic", enhancement.damage)];
}

/** The properties of `base`, those of `own` over them by type. */
function withOwnProperties(base: Property[], own: Property[]): Property[] {
  const ownTypes = new Set(own.map((property) => property.type));
  return [...base.filter((property) => !ownTypes.has(property.type)), ...own];
}

/**
 * The magic item seeds, by kind. A specific armor or shield takes the stats its text gives (`readArmorStats`) and its
 * enhancement bonus to AC, a specific weapon made from a base one its enhancement bonus to attack and damage
 * (`readWeaponEnhancement`); an item made from a base one weighs what its base does (`baseWeights`, by name) unless it
 * says otherwise.
 */
export function buildMagicItemSeeds(
  ref: MagicItemReference,
  baseWeights: Record<string, string> = {},
): MagicItemSeedSets {
  const magicArmor: ItemDef[] = [];
  const magicShields: ItemDef[] = [];
  const magicWeapons: ItemDef[] = [];
  const wondrousItems: ItemDef[] = [];
  const rings: ItemDef[] = [];
  const rods: ItemDef[] = [];
  const staffs: ItemDef[] = [];

  const categoryBuckets: Record<MagicItemCategory, ItemDef[]> = {
    specificArmor: magicArmor,
    specificShield: magicShields,
    specificWeapon: magicWeapons,
    wondrousItem: wondrousItems,
    ring: rings,
    rod: rods,
    staff: staffs,
  };

  for (const { name, det, override: ovr, slot } of seededMagicItems(ref)) {
    const costGp = ovr?.costGp ?? det.costGp;
    // Find the raw entry for description
    const rawEntry = ref.raw.find((r) => r.name === name);
    const baseItemRaw =
      ovr?.baseItem !== undefined
        ? ovr.baseItem
        : (det.baseItem ?? detectBaseItem(name, rawEntry?.description ?? "", det.category));
    const sourceItem = baseItemRaw ?? undefined;

    const description = normalizeDescription(ovr?.description ?? rawEntry?.description ?? "");
    const stats = ARMOR_CATEGORIES.has(det.category) ? readArmorStats(description) : undefined;
    const statedWeight = stats?.weight ?? (det.weight !== "0" ? det.weight : undefined);
    const weight = ovr?.weight ?? statedWeight ?? (sourceItem && baseWeights[sourceItem]) ?? det.weight;

    const aura = ovr?.aura ?? det.aura;
    const casterLevel = ovr?.casterLevel ?? det.casterLevel;
    const properties: Property[] = [];
    if (aura) properties.push({ type: MAGIC_AURA, value: aura });
    if (casterLevel) properties.push({ type: MAGIC_CASTER_LEVEL, value: String(casterLevel) });
    properties.push(...(stats?.properties ?? []));
    if (ovr?.properties) properties.push(...ovr.properties);
    // Its enhancement bonus: an armor's or a shield's to its part of the AC, a weapon's to its own attack and damage
    // (not ammunition's, made from no weapon, which no hand holds)
    const enhancement: Modifier[] = stats?.enhancement
      ? [
          {
            target: det.category === "specificArmor" ? "combat.ac.armor" : "combat.ac.shield",
            operator: "add",
            value: String(stats.enhancement),
            valueType: "number",
          },
        ]
      : det.category === "specificWeapon" && sourceItem
        ? weaponEnhancementModifiers(description)
        : [];
    // An override's modifiers, an empty list too, win over those detected
    const modifiers = ovr?.modifiers ?? [...(det.modifiers ?? []), ...enhancement];

    const bucket = categoryBuckets[det.category];
    if (!bucket) throw new Error(`${name}: the seed has no magic items of the category "${det.category}"`);

    const categoryWord = CATEGORY_PREFIX[det.category];
    let itemName = name;
    if (categoryWord) {
      // Normalize plural category in name: "Metamagic Rods" → "Metamagic Rod"
      itemName = itemName
        .replace(/\bRods\b/g, "Rod")
        .replace(/\bRings\b/g, "Ring")
        .replace(/\bStaffs\b/g, "Staff");
      if (!new RegExp(`\\b${categoryWord}\\b`, "i").test(itemName)) {
        itemName = `${categoryWord} of ${itemName}`;
      }
    }

    // A template is made from nothing: its base armor's properties are its own, under those it changes
    if (ovr?.template && (det.category !== "specificArmor" || !sourceItem)) {
      throw new Error(`${name}: only a specific armor made from a base armor can be a template`);
    }
    bucket.push({
      name: itemName,
      description,
      weight,
      costGp,
      type: det.itemType,
      slot: slot && checkedValue(slot),
      ...(ovr?.template && sourceItem
        ? { isTemplate: true as const, properties: withOwnProperties(armorProperties(sourceItem), properties) }
        : { properties, ...(sourceItem ? { sourceItem } : {}) }),
      ...(modifiers.length ? { modifiers } : {}),
    });
  }

  return { magicArmor, magicShields, magicWeapons, wondrousItems, rings, rods, staffs };
}

/**
 * The magic items a magic item reference seeds (those its overrides don't skip), each with its override and its slot,
 * checked when it has one: the override's, else as detected. Generation throws a slot's problem, and
 * `parser:validate` reports it.
 */
export function seededMagicItems(ref: MagicItemReference) {
  return Object.entries(ref.detected).flatMap(([name, det]) => {
    const override = ref.overrides?.[name];
    if (override?.skip) return [];
    const slot = override?.slot ?? det.slot;
    return [{ name, det, override, slot: slot ? checkOneOf(slot, LOCATION_OPTIONS, `${name}'s slot`) : undefined }];
  });
}
