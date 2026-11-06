import { bonus } from "@/content/core/builders/customization/modifiers.ts";
import type { Modifier } from "@/content/core/builders/customization/types.ts";
import { grantFeat } from "@/content/pf1/builders/feats/possession.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { ALL_WEAPONS, MARTIAL_WEAPONS, SIMPLE_WEAPONS } from "@/vocabulary/pf1/weapons.ts";

import { splitList } from "./lists.ts";

/** The pool a cleric picks her deity's favored weapon in, whose feat grants its proficiency. */
const DEITYS_FAVORED_WEAPON = "aptitudes.deitysfavoredweapon.allowed";

/** A proficiency a list gives to pick that no pool offers: the commoner's simple weapon. */
const PICKED = /\bone simple weapon\b/;

/** The weapons a proficiency's list names by a group of them, lowercased: "crossbow (light or heavy)". */
const WEAPON_GROUPS: Record<string, string[]> = {
  "crossbow (hand, light, or heavy)": ["Hand Crossbow", "Light Crossbow", "Heavy Crossbow"],
  "crossbow (light or heavy)": ["Light Crossbow", "Heavy Crossbow"],
  "dagger (any type)": ["Dagger", "Punching Dagger"],
  mace: ["Light Mace", "Heavy Mace"],
  "shortbow (normal and composite)": ["Shortbow", "Composite Shortbow"],
};

/** The weapons by their name, lowercased. */
const WEAPONS_BY_NAME = new Map<string, string>(ALL_WEAPONS.map((name) => [name.toLowerCase(), name]));

/**
 * The weapons a proficiency's sentence lists one by one, after "proficient with" or "skilled with" ("the club, crossbow
 * (light or heavy), dagger…", "all simple weapons, plus the longsword…"): each item a weapon's name or a group's.
 */
function listedWeapons(sentence: string): string[] {
  const list = /(?:proficient|skilled) (?:with|in the use of) (?:the following weapons: )?(.+)$/.exec(sentence)?.[1];
  if (!list) return [];
  return splitList(list.trim().replace(/[.,]+$/, ""))
    .flatMap((item) => item.split(/ and with /))
    .map((item) => item.replace(/^(?:plus |and )?(?:the )?/, "").replace(/,? but$/, ""))
    .flatMap((item) => WEAPON_GROUPS[item] ?? [WEAPONS_BY_NAME.get(item)].filter((weapon) => weapon !== undefined));
}

/** A weapon's own proficiency's feat, of its group: "Martial Weapon Proficiency: Rapier". */
function weaponProficiency(weapon: string): string {
  const group = isOneOf(weapon, SIMPLE_WEAPONS) ? "Simple" : isOneOf(weapon, MARTIAL_WEAPONS) ? "Martial" : "Exotic";
  return `${group} Weapon Proficiency: ${weapon}`;
}

/**
 * What a class's Weapon and Armor Proficiency feature grants, its sentences on proficiency read up to what they deny
 * ("…but not with shields"): all simple (and martial) weapons, the weapons it lists, each its own proficiency, light,
 * medium and heavy armor, shields, tower shields; each a feat's grant. A proficiency it gives to pick, which no feat
 * grants (a commoner's simple weapon, a cleric's deity's favored weapon), is unread.
 */
export class ClassProficiencies {
  constructor(text: string) {
    const sentences = text
      .toLowerCase()
      .split(/(?<=\.)\s+/)
      .filter((sentence) => /\bproficien|\bskilled with\b/.test(sentence))
      .map((sentence) => sentence.split(/\b(?:but )?(?:not|nor)\b/)[0]);
    for (const sentence of sentences) this.read(sentence);
    const picked = PICKED.exec(text);
    if (picked) this.unplaced.push(`proficiency with ${picked[0]}`);
    this.favoredWeapon = /\bfavored weapon of their deity\b/.test(text);
  }

  /** Whether it gives its deity's favored weapon's proficiency: a cleric's, a pick in its pool. */
  private readonly favoredWeapon: boolean;

  /** The feats it grants, each once, in the order it reads them. */
  private readonly feats = new Set<string>();
  /** What it gives that no feat grants. */
  private readonly unplaced: string[] = [];

  /** What a sentence on proficiency grants, up to what it denies. */
  private read(sentence: string) {
    const { feats } = this;
    if (/all simple and martial weapons/.test(sentence))
      feats.add("Simple Weapon Proficiency").add("Martial Weapon Proficiency");
    else if (/all simple weapons/.test(sentence)) feats.add("Simple Weapon Proficiency");
    for (const weapon of listedWeapons(sentence)) feats.add(weaponProficiency(weapon));
    const allArmor = /\ball (?:types of )?armor\b/.test(sentence);
    if (allArmor || /\blight (?:and medium )?armor\b/.test(sentence)) feats.add("Armor Proficiency, Light");
    if (allArmor || /\bmedium armor\b/.test(sentence)) feats.add("Armor Proficiency, Medium");
    if (allArmor || /\bheavy armor\b/.test(sentence)) feats.add("Armor Proficiency, Heavy");
    if (/\bshields\b/.test(sentence)) feats.add("Shield Proficiency");
    if (/\bincluding tower shields\b/.test(sentence)) feats.add("Tower Shield Proficiency");
  }

  /** The feats it grants, as their grants, and a pick of its deity's favored weapon. */
  modifiers(): Modifier[] {
    return [
      ...[...this.feats].map((name) => grantFeat(name)),
      ...(this.favoredWeapon ? [bonus(DEITYS_FAVORED_WEAPON, 1)] : []),
    ];
  }

  /** What it gives that no feat grants: "proficiency with one simple weapon". */
  unread(): string[] {
    return this.unplaced;
  }
}
