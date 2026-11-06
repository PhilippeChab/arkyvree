import type { RaceEntry } from "@/codegen/pf1/tools/types/races.ts";
import { bonus } from "@/content/core/builders/customization/modifiers.ts";
import type { Modifier } from "@/content/core/builders/customization/types.ts";
import { grantFeat } from "@/content/pf1/builders/feats/possession.ts";
import { grantLanguage } from "@/content/pf1/builders/languages/knowledge.ts";
import type { RaceFields } from "@/content/pf1/builders/races/types.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { stripSeparators } from "@/shared/text.ts";
import { RACE_BASE_SPEED, RACE_SIZE, RACE_SPEED_IGNORES_ENCUMBRANCE } from "@/vocabulary/pf1/fields/index.ts";
import { SIZE_OPTIONS } from "@/vocabulary/pf1/sizes.ts";
import { SKILL_NAMES } from "@/vocabulary/pf1/skills.ts";
import { ALL_WEAPONS, MARTIAL_WEAPONS, SIMPLE_WEAPONS } from "@/vocabulary/pf1/weapons.ts";

/** The saves a bonus "on all saving throws" adds to. */
const SAVES = ["fortitude", "reflex", "will"];

/** A number as a trait writes it, its minus an en dash ("–2"). */
function signed(text: string): number {
  return Number(text.replace("–", "-"));
}

/**
 * A race's racial traits read into its seed: its size and speed, and its modifiers. A trait's bonus is read only when
 * it always applies: one on checks "made to" do something, against some creatures or effects, or of the race's choice
 * ("a Craft or Profession skill of their choice") isn't, and is left to the table; but its ability score of its
 * player's choice ("+2 to One Ability Score") is a pick in the pool the hand-written core feats give one feat per ability
 * in. What no reading takes is listed (`unread`), for review.
 */
export default class RaceTraits {
  constructor(private readonly entry: RaceEntry) {}

  /** The traits read, by label. */
  private readonly read = new Set<string>();

  /**
   * Its ability adjustments: a label of signed scores ("+2 Constitution, +2 Wisdom, –2 Charisma"), or one ability score
   * of its player's choice ("+2 to One Ability Score"), a pick in the Racial Ability Score pool.
   */
  private abilities(): Modifier[] {
    const chosen = this.entry.traits.find(({ label }) => /^\+2 to One Ability Score$/i.test(label));
    if (chosen) {
      this.read.add(chosen.label);
      return [bonus("aptitudes.racialabilityscore.allowed", 1)];
    }
    const trait = this.entry.traits.find(({ label }) => /^[+–-]\d+ [A-Z][a-z]+(, [+–-]\d+ [A-Z][a-z]+)*$/.test(label));
    if (!trait) return [];
    this.read.add(trait.label);
    return [...trait.label.matchAll(/([+–-]\d+) ([A-Z][a-z]+)/g)].map(([, value, ability]) =>
      bonus(`abilities.${ability.toLowerCase()}.misc`, signed(value)),
    );
  }

  /** The human's: one more feat at 1st level ("Bonus Feat"), and one more skill rank a level ("Skilled"). */
  private extras(): Modifier[] {
    const modifiers: Modifier[] = [];
    for (const { label, text } of this.entry.traits) {
      if (/one extra feat at 1st level/.test(text)) modifiers.push(bonus("aptitudes.general.allowed", 1));
      else if (/1 additional rank whenever they gain a level/.test(text))
        modifiers.push(bonus("skills.budget.perlevel", 1));
      else continue;
      this.read.add(label);
    }
    return modifiers;
  }

  /** The languages it speaks from the start ("begin play speaking Common and Dwarven"), each a known language. */
  private languages(): Modifier[] {
    const trait = this.entry.traits.find(({ label }) => label === "Languages");
    const spoken = trait?.text.match(/begin play speaking ([^.]+)\./)?.[1];
    if (!trait || !spoken) return [];
    this.read.add(trait.label);
    return spoken
      .split(/,? and |, /)
      .filter((name) => /^[A-Z][a-z]+$/.test(name))
      .map((name) => grantLanguage(name));
  }

  /** Its bonuses on saves: one "on all saving throws", with no condition after it (halfling luck), on each. */
  private saves(): Modifier[] {
    const modifiers: Modifier[] = [];
    for (const { label, text } of this.entry.traits) {
      const value = text.match(/\+(\d+) racial bonus on all saving throws\./)?.[1];
      if (!value) continue;
      this.read.add(label);
      modifiers.push(...SAVES.map((save) => bonus(`saves.${save}.misc`, Number(value))));
    }
    return modifiers;
  }

  /**
   * Its bonuses on skills, each on the checks of skills it names, with no condition after them ("+2 racial bonus on
   * Acrobatics and Climb checks."): a bonus on checks "made to" do something, or on a skill of its choice, is left out.
   */
  private skills(): Modifier[] {
    const modifiers: Modifier[] = [];
    for (const { label, text } of this.entry.traits) {
      const match = text.match(/\+(\d+) racial bonus on ([A-Z][A-Za-z ()]+?) (?:skill )?checks(?: because [^.]+)?\./);
      if (!match) continue;
      const names = match[2].split(/,? and |, /);
      if (!names.every((name) => isOneOf(name, SKILL_NAMES))) continue;
      this.read.add(label);
      modifiers.push(...names.map((name) => bonus(`skills.${stripSeparators(name)}.misc`, Number(match[1]))));
    }
    return modifiers;
  }

  /**
   * Its weapons' proficiencies ("proficient with longbows (including composite longbows), longswords…"), each
   * weapon's own, of its group: a weapon "treated as martial" by its name is the weapon's own familiarity, its
   * vocabulary's.
   */
  private weapons(): Modifier[] {
    const trait = this.entry.traits.find(({ label }) => label === "Weapon Familiarity");
    const listed = trait?.text.match(/proficient with (.+?)(?:,? and treat|$)/)?.[1];
    if (!trait) return [];
    this.read.add(trait.label);
    if (!listed) return [];
    const names = listed
      .replaceAll(/\(including ([^)]+)\)/g, ", $1")
      .split(/,? and |, /)
      .map((name) => name.trim())
      .filter(Boolean);
    return names.map((plural) => {
      const weapon = ALL_WEAPONS.find((name) => `${name.toLowerCase()}s` === plural.toLowerCase());
      if (!weapon) throw new Error(`${this.entry.name}'s weapon familiarity names "${plural}", no weapon's plural`);
      const group = isOneOf(weapon, SIMPLE_WEAPONS)
        ? "Simple"
        : isOneOf(weapon, MARTIAL_WEAPONS)
          ? "Martial"
          : "Exotic";
      return grantFeat(`${group} Weapon Proficiency: ${weapon}`);
    });
  }

  /** Its size (its trait labelled with a size) and its speed ("a base speed of 20 feet", and whether armor and load leave it). */
  fields(): RaceFields {
    const size = this.entry.traits.find(({ label }) => isOneOf(label, SIZE_OPTIONS));
    const speed = this.entry.traits.find(({ text }) => /base speed of \d+ feet/.test(text));
    if (!size || !speed) throw new Error(`${this.entry.name}'s traits give no size or no base speed`);
    this.read.add(size.label).add(speed.label);
    return {
      [RACE_SIZE]: size.label as (typeof SIZE_OPTIONS)[number],
      [RACE_BASE_SPEED]: Number(speed.text.match(/base speed of (\d+) feet/)![1]),
      ...(/never modified by armor or encumbrance/.test(speed.text) ? { [RACE_SPEED_IGNORES_ENCUMBRANCE]: true } : {}),
    };
  }

  /** Its modifiers: its abilities', its skills', its saves', its extras', its weapons', then its languages' grants. */
  modifiers(): Modifier[] {
    return [
      ...this.abilities(),
      ...this.skills(),
      ...this.saves(),
      ...this.extras(),
      ...this.weapons(),
      ...this.languages(),
    ];
  }

  /** The traits no reading took, by label: once `fields` and `modifiers` have read them. */
  unread(): string[] {
    return this.entry.traits.map(({ label }) => label).filter((label) => !this.read.has(label));
  }
}
