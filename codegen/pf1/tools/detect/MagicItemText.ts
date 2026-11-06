import type { ItemFields } from "@/content/pf1/builders/items/types.ts";
import { capitalize } from "@/shared/text.ts";
import { ARMOR_TYPE_NAMES, SHIELD_TYPE_NAMES } from "@/vocabulary/pf1/armor.ts";
import {
  ARMOR_CHECK_PENALTY,
  ARMOR_MAX_DEX,
  ARMOR_PROFICIENCY,
  ITEM_MASTERWORK,
  ITEM_SPELL_FAILURE,
} from "@/vocabulary/pf1/fields/index.ts";
import { WEAPON_TYPE_NAMES } from "@/vocabulary/pf1/weapons.ts";

/** What a specific armor's or shield's text says of itself, over its base's: its stats and its enhancement. */
export interface ArmorStats {
  enhancement?: number;
  fields: ItemFields;
}

/** A specific weapon's enhancement bonus, on its attack rolls and on its damage rolls. */
export interface WeaponEnhancement {
  attack: number;
  damage: number;
}

/** The kind of specific item a base item is looked for. */
export type BaseKind = "armor" | "shield" | "weapon";

/** The words a text calls a base by that aren't its name, by kind: "plate armor" is full plate. */
const ALIASES: Record<BaseKind, Record<string, string>> = {
  armor: { "plate armor": "Full Plate" },
  shield: { "heavy shield": "Heavy Steel Shield", "light shield": "Light Steel Shield" },
  weapon: {},
};

/** "This +3 banded mail", "this +1 heavy steel shield", or a shield that "has a +3 enhancement bonus". */
const ARMOR_ENHANCEMENTS = [
  /\+(\d)\s+(?:[a-z-]+\s+){0,3}?(?:mail|plate|armor|breastplate|chainmail|shield)\b/i,
  /\ba \+(\d) enhancement bonus\b/,
];

/** The base items of each kind, by name, the longest first: "Heavy Crossbow" before "Crossbow". */
const BASES: Record<BaseKind, string[]> = {
  armor: ARMOR_TYPE_NAMES.toSorted((a, b) => b.length - a.length),
  shield: SHIELD_TYPE_NAMES.toSorted((a, b) => b.length - a.length),
  weapon: WEAPON_TYPE_NAMES.toSorted((a, b) => b.length - a.length),
};

/** The materials an item can be made of, as its name or text writes them, and their value. */
const MATERIALS: [RegExp, string][] = [
  [/\badamantine\b/i, "Adamantine"],
  [/\bmithral\b/i, "Mithral"],
  [/\bdarkwood\b/i, "Darkwood"],
  [/\bcold iron\b/i, "Cold Iron"],
  [/\b(?:alchemical )?silver\b/i, "Silver"],
];

/** A stat the text states ("a maximum Dexterity bonus of +4"), and the item's field that holds it. */
const STATS: [RegExp, (match: RegExpMatchArray) => ItemFields][] = [
  [
    /arcane spell failure chance of (\d+)%|(\d+)% arcane spell failure chance/,
    (m) => ({ [ITEM_SPELL_FAILURE]: Number(m[1] ?? m[2]) }),
  ],
  [/maximum Dexterity bonus of \+(\d+)/, (m) => ({ [ARMOR_MAX_DEX]: Number(m[1]) })],
  [
    /armor check penalty of [-–](\d+)|[-–](\d+) armor check penalty/,
    (m) => ({ [ARMOR_CHECK_PENALTY]: -Number(m[1] ?? m[2]) }),
  ],
  [/no armor check penalty/, () => ({ [ARMOR_CHECK_PENALTY]: 0 })],
  [
    /(?:considered|treated, in all ways, like) (light|medium|heavy) armor/,
    (m) => ({ [ARMOR_PROFICIENCY]: capitalize(m[1]) }),
  ],
];

/** What a weapon is named in its text, last word: "this +2 dagger", "a +1 flaming burst longsword". */
const WEAPON_NOUN = String.raw`(?:sword|longsword|greatsword|dagger|warhammer|greataxe|mace|longbow|shortbow|bow|rapier|scimitar|trident|axe|hammer)`;

/**
 * Its enhancement, as its text first gives it: "this +2 short sword" (later, conditional ones, such as a holy avenger's
 * +5 in a paladin's hands, stay in its text), "an enhancement bonus of +1", or a masterwork weapon's +1 on attack rolls
 * only.
 */
const WEAPON_ENHANCEMENTS: [RegExp, (bonus: number) => WeaponEnhancement][] = [
  [
    /As a masterwork weapon, [^.]*?has a \+(\d) enhancement bonus on attack rolls/,
    (bonus) => ({ attack: bonus, damage: 0 }),
  ],
  [
    new RegExp(String.raw`\+(\d)(?:/\+\d)?\s+(?:[a-z'-]+\s+){0,3}?${WEAPON_NOUN}\b`, "i"),
    (bonus) => ({ attack: bonus, damage: bonus }),
  ],
  [/enhancement bonus of \+(\d)/, (bonus) => ({ attack: bonus, damage: bonus })],
];

/**
 * A specific magic item's text (its description), read for what it says of the item beside its modifiers: the base
 * item it's made from (`baseItem`), a specific armor's or shield's stats (`armorStats`), a specific weapon's
 * enhancement bonus (`weaponEnhancement`), what it's made of (`material`).
 */
export class MagicItemText {
  constructor(readonly text: string) {}

  /**
   * A specific armor's or shield's stats as its text gives them. Magic armor is masterwork, and so is adamantine or
   * dragonhide armor, which lessens its check penalty: unless the text gives that penalty, which is then the armor's
   * own.
   */
  armorStats(): ArmorStats {
    // A stat two of its patterns match is the first pattern's, in `STATS`' order
    const fields = STATS.reduce<ItemFields>((stated, [pattern, field]) => {
      const match = this.text.match(pattern);
      return match ? { ...field(match), ...stated } : stated;
    }, {});
    const enhancementMatch = ARMOR_ENHANCEMENTS.map((pattern) => this.text.match(pattern)).find(Boolean);
    const enhancement = enhancementMatch ? Number(enhancementMatch[1]) : undefined;
    const masterwork = enhancement !== undefined || /\b(?:adamantine|masterwork)\b/i.test(this.text);
    if (masterwork && fields[ARMOR_CHECK_PENALTY] === undefined) fields[ITEM_MASTERWORK] = true;
    return { fields, ...(enhancement && { enhancement }) };
  }

  /** The base item of `kind` a specific item is made from: the one its text names first, else the one its name does. */
  baseItem(name: string, kind: BaseKind): string | undefined {
    const lowerText = this.text.toLowerCase();
    for (const [alias, base] of Object.entries(ALIASES[kind])) if (lowerText.includes(alias)) return base;
    const named = (text: string) =>
      BASES[kind]
        .map((base) => ({ base, index: text.search(new RegExp(`\\b${base.toLowerCase()}\\b`)) }))
        .filter(({ index }) => index >= 0)
        .sort((a, b) => a.index - b.index)[0]?.base;
    return named(lowerText) ?? named(name.toLowerCase());
  }

  /** What the item is made of, as its name or else its text first says it: none for most. */
  material(name: string): string | undefined {
    for (const source of [name, this.text]) {
      const found = MATERIALS.map(([pattern, material]) => ({ material, index: source.search(pattern) }))
        .filter(({ index }) => index >= 0)
        .sort((a, b) => a.index - b.index)[0];
      if (found) return found.material;
    }
    return undefined;
  }

  /** A specific weapon's enhancement bonus, by its text: none when it gives none. */
  weaponEnhancement(): WeaponEnhancement | undefined {
    const found = WEAPON_ENHANCEMENTS.map(([pattern, enhancement]) => {
      const match = this.text.match(pattern);
      return match ? { index: match.index ?? 0, enhancement: enhancement(Number(match[1])) } : undefined;
    }).filter((entry) => entry !== undefined);
    // The first the text gives
    return found.sort((a, b) => a.index - b.index)[0]?.enhancement;
  }
}
