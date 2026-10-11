/**
 * A specific magic item's text, read for what it says of the item: its base item, its armor's stats, its weapon's
 * enhancement.
 */

import type { MagicItemCategory } from "@/codegen/dnd3.5/tools/types/magicItems.ts";
import type { Property } from "@/content/core/builders/customization/types.ts";
import { capitalize } from "@/shared/text.ts";
import {
  ARMOR_CHECK_PENALTY,
  ARMOR_MAX_DEX,
  ARMOR_PROFICIENCY,
  ITEM_MASTERWORK,
  ITEM_SPELL_FAILURE,
} from "@/vocabulary/dnd3.5/properties/index.ts";

/** What a specific armor's or shield's text says of itself, over its base's: its stats, weight and enhancement. */
interface ArmorStats {
  enhancement?: number;
  properties: Property[];
  weight?: string;
}

/** A specific weapon's enhancement bonus, on its attack rolls and on its damage rolls. */
interface WeaponEnhancement {
  attack: number;
  damage: number;
}

/** Common alternative spellings in SRD descriptions → canonical template name, scoped by category */
const ALIASES: Partial<Record<MagicItemCategory, Record<string, string>>> = {
  specificWeapon: {
    "short sword": "Shortsword",
  },
  specificArmor: {
    chainmail: "Chain Mail",
    "chain mail": "Chain Mail",
    "plate armor": "Full Plate",
  },
  specificShield: {
    "heavy shield": "Heavy Steel Shield",
  },
};

/** The base armors' template names, longest first. */
const BASE_ARMOR = [
  "Studded Leather",
  "Leather Armor",
  "Padded Armor",
  "Chain Shirt",
  "Hide Armor",
  "Scale Mail",
  "Chain Mail",
  "Breastplate",
  "Splint Mail",
  "Banded Mail",
  "Half-Plate",
  "Full Plate",
];

/** The base shields' template names, longest first. */
const BASE_SHIELDS = [
  "Light Wooden Shield",
  "Light Steel Shield",
  "Heavy Wooden Shield",
  "Heavy Steel Shield",
  "Tower Shield",
  "Buckler",
];

/** The base weapons' template names, longest first. */
const BASE_WEAPONS = [
  "Repeating Heavy Crossbow",
  "Repeating Light Crossbow",
  "Gnome Hooked Hammer",
  "Two-Bladed Sword",
  "Composite Longbow",
  "Composite Shortbow",
  "Dwarven Urgrosh",
  "Orc Double Axe",
  "Spiked Gauntlet",
  "Punching Dagger",
  "Hand Crossbow",
  "Heavy Crossbow",
  "Light Crossbow",
  "Dwarven Waraxe",
  "Bastard Sword",
  "Spiked Chain",
  "Throwing Axe",
  "Light Hammer",
  "Morningstar",
  "Heavy Flail",
  "Heavy Mace",
  "Heavy Pick",
  "Light Mace",
  "Light Pick",
  "Dire Flail",
  "Battleaxe",
  "Greatclub",
  "Greatsword",
  "Greataxe",
  "Longsword",
  "Shortsword",
  "Warhammer",
  "Guisarme",
  "Nunchaku",
  "Shortspear",
  "Longspear",
  "Quarterstaff",
  "Falchion",
  "Scimitar",
  "Halberd",
  "Ranseur",
  "Handaxe",
  "Trident",
  "Longbow",
  "Shortbow",
  "Siangham",
  "Shuriken",
  "Gauntlet",
  "Dagger",
  "Sickle",
  "Rapier",
  "Lance",
  "Glaive",
  "Kukri",
  "Flail",
  "Spear",
  "Club",
  "Whip",
  "Dart",
  "Javelin",
  "Sling",
  "Scythe",
  "Kama",
  "Sap",
  "Bolas",
  "Net",
  "Sai",
];

/** "This +3 banded mail", "this +1 heavy steel shield", or a shield that "has a +3 enhancement bonus". */
const ENHANCEMENT = [
  /\+(\d)\s+(?:[a-z-]+\s+){0,3}?(?:mail|plate|armor|breastplate|chainmail|shield)\b/i,
  /\ba \+(\d) enhancement bonus\b/,
];

/** What a weapon is named in its text, last word: "this +2 dagger", "a +1 flaming burst longsword". */
const WEAPON_NOUN = String.raw`(?:sword|longsword|dagger|warhammer|greatsword|greataxe|mace|longbow|shortbow|bow|rapier|scimitar|trident|axe|hammer)`;

/**
 * Its enhancement, as its text first gives it: "this +2 short sword" (later, conditional ones, such as a holy avenger's
 * +5 in a paladin's hands, stay in its text), "an enhancement bonus of +1", or a masterwork weapon's +1 on attack rolls
 * only.
 */
const ENHANCEMENTS: [RegExp, (bonus: number) => WeaponEnhancement][] = [
  [
    /As a masterwork weapon, it has a \+(\d) enhancement bonus on attack rolls/,
    (bonus) => ({ attack: bonus, damage: 0 }),
  ],
  [
    new RegExp(String.raw`\+(\d)(?:/\+\d)?\s+(?:[a-z'-]+\s+){0,3}?${WEAPON_NOUN}\b`, "i"),
    (bonus) => ({ attack: bonus, damage: bonus }),
  ],
  [/enhancement bonus of \+(\d)/, (bonus) => ({ attack: bonus, damage: bonus })],
];

/** A stat the text states ("a maximum Dexterity bonus of +4"), and its value as the property holds it. */
const STATS: [RegExp, string, (match: RegExpMatchArray) => string][] = [
  [/arcane spell failure chance of (\d+)%|(\d+)% arcane spell failure chance/, ITEM_SPELL_FAILURE, (m) => m[1] ?? m[2]],
  [/maximum Dexterity bonus of \+(\d+)/, ARMOR_MAX_DEX, (m) => m[1]],
  [/armor check penalty of [-–](\d+)|[-–](\d+) armor check penalty/, ARMOR_CHECK_PENALTY, (m) => `-${m[1] ?? m[2]}`],
  [/no armor check penalty/, ARMOR_CHECK_PENALTY, () => "0"],
  [/considered (light|medium|heavy) armor/, ARMOR_PROFICIENCY, (m) => capitalize(m[1])],
];

/**
 * A specific magic item's text (its description), read for what it says of the item beside its modifiers: the base
 * item it's made from (`baseItem`), a specific armor's or shield's stats (`armorStats`), a specific weapon's
 * enhancement bonus (`weaponEnhancement`).
 */
export class MagicItemText {
  constructor(readonly text: string) {}

  /**
   * A specific armor's or shield's stats as its text gives them. Magic armor is masterwork, and so is adamantine or
   * dragonhide armor, which lessens its check penalty: unless the text gives that penalty, which is then the armor's
   * own.
   */
  armorStats(): ArmorStats {
    const properties = STATS.flatMap(([pattern, type, value]) => {
      const match = this.text.match(pattern);
      return match ? [{ type, value: value(match) }] : [];
    });
    const enhancementMatch = ENHANCEMENT.map((pattern) => this.text.match(pattern)).find(Boolean);
    const enhancement = enhancementMatch ? Number(enhancementMatch[1]) : undefined;
    const masterwork = enhancement !== undefined || /\b(?:adamantine|masterwork)\b/i.test(this.text);
    if (masterwork && !properties.some((property) => property.type === ARMOR_CHECK_PENALTY))
      properties.push({ type: ITEM_MASTERWORK, value: "true" });

    const weightMatch = this.text.match(/weighs (\d+)(½)? pounds/);
    const weight = weightMatch ? `${weightMatch[1]}${weightMatch[2] ? ".5" : ""}` : undefined;
    return { properties, ...(weight && { weight }), ...(enhancement && { enhancement }) };
  }

  /** The base item a specific weapon, armor or shield is made from: the one its description names, else its name. */
  baseItem(name: string, category: MagicItemCategory): string | undefined {
    let candidates: string[];
    if (category === "specificWeapon") candidates = BASE_WEAPONS;
    else if (category === "specificArmor") candidates = BASE_ARMOR;
    else if (category === "specificShield") candidates = BASE_SHIELDS;
    else return undefined;

    const lowerDesc = this.text.toLowerCase();

    // Check category-scoped aliases first (e.g., "chainmail" → "Chain Mail" for armor only)
    const categoryAliases = ALIASES[category];
    if (categoryAliases)
      for (const [alias, canonical] of Object.entries(categoryAliases)) if (lowerDesc.includes(alias)) return canonical;

    for (const base of candidates) if (lowerDesc.includes(base.toLowerCase())) return base;

    const lowerName = name.toLowerCase();
    for (const base of candidates) if (lowerName.includes(base.toLowerCase())) return base;

    return undefined;
  }

  /** A specific weapon's enhancement bonus, by its text: none when it gives none. */
  weaponEnhancement(): WeaponEnhancement | undefined {
    const found = ENHANCEMENTS.map(([pattern, enhancement]) => {
      const match = this.text.match(pattern);
      return match ? { index: match.index ?? 0, enhancement: enhancement(Number(match[1])) } : undefined;
    }).filter((entry) => entry !== undefined);
    // The first the text gives
    return found.sort((a, b) => a.index - b.index)[0]?.enhancement;
  }
}
