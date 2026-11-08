import { bonus } from "@/content/core/builders/customization/modifiers.ts";
import type { Modifier } from "@/content/core/builders/customization/types.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { stripSeparators } from "@/shared/text.ts";
import { ABILITY_NAMES } from "@/vocabulary/pf1/abilities.ts";
import { SKILL_NAMES } from "@/vocabulary/pf1/skills.ts";

/** What's worn or held, which conditions nothing: "when worn", "while wielding it". */
const EQUIPPED =
  /\b(?:when|while|if|as long as)\s+(?:(?:it is|you are|he is|she is)\s+)?(?:worn|wearing|held|holding|wielded|wielding)\b/gi;

/** A bonus on initiative: "+2 insight bonus on initiative checks". */
const INITIATIVE_BONUS = /\+(\d+) (?:[a-z]+ )?bonus (?:on|to) initiative/g;

/** The abilities an item's name ending names, by that ending: an ability's name, or a group of them. */
const NAMED_ABILITIES: Record<string, readonly string[]> = {
  ...Object.fromEntries(ABILITY_NAMES.map((ability) => [ability.toLowerCase(), [ability]])),
  "mental superiority": ["Intelligence", "Wisdom", "Charisma"],
  "physical perfection": ["Strength", "Dexterity", "Constitution"],
};

/**
 * A bonus a variant's name gives ("Cloak of Resistance +2"), by its pattern: the modifiers of its value. An Amulet of
 * Natural Armor's is an enhancement bonus to natural armor, which stacks with a natural armor bonus.
 */
const NAMED_BONUSES: [RegExp, (value: number) => Modifier[]][] = [
  [/^Amulet of Natural Armor \+(\d+)$/, (value) => [bonus("combat.ac.naturalenhancement", value)]],
  [/^Bracers of Armor \+(\d+)$/, (value) => [bonus("combat.ac.armor", value)]],
  [/^Cloak of Resistance \+(\d+)$/, (value) => [bonus("saves.*.misc", value)]],
  [/^Ring of Protection \+(\d+)$/, (value) => [bonus("combat.ac.deflection", value)]],
];

/** A bonus on every save: "+1 luck bonus on all saving throws". */
const SAVES_BONUS = /\+(\d+) (?:[a-z]+ )?bonus on all saving throws/g;

/**
 * A bonus on skill checks: "+5 competence bonus on Stealth checks", "+2 on Climb and Swim checks". Not one on checks
 * the words after narrow: "Acrobatics checks made to jump", "Linguistics checks to understand".
 */
const SKILL_BONUS =
  /\+(\d+) (?:[a-z]+ )?bonus on (?:all )?(?:(?:the wearer's|his|her|its|your) )?([A-Z][A-Za-z ()]*?) (?:skill )?checks\b(?!\s+(?:made|to|that|related|involving|for|when|while|against)\b)/g;

/**
 * What makes a sentence's bonus apply only sometimes: a condition ("against", "while raging"), an effect used ("once per
 * day", "as a standard action", "for 10 minutes"), or someone else it goes to.
 */
const SOMETIMES =
  /\b(?:against|while|whenever|when|during|versus|if|unless|only|per day|times? (?:a|per) day|allies|ally)\b|\/day\b|\bas an? (?:free|swift|immediate|move|standard|full-round) action\b|\bfor (?:\d+|one|a|an) (?:rounds?|minutes?|hours?)\b/i;

/** The sentences of `text`, each up to its period. */
function sentencesOf(text: string): string[] {
  return text.split(/(?<=\.)\s+(?=[A-Z])/);
}

/**
 * A magic item's modifiers, those always on while it's worn or held: the bonus its variant's name gives ("Cloak of
 * Resistance +2", "Belt of Giant Strength +4": an enhancement bonus to the ability its name ends on), and those its
 * description gives in a sentence of no condition (a skill's, every save's, initiative's). A manual's or a tome's
 * bonus is inherent, read once, so none of an item's.
 */
export default class MagicItemBonuses {
  constructor(
    private readonly name: string,
    private readonly description: string,
  ) {}

  /** The modifiers its description's unconditional sentences give: skills', every save's, initiative's. */
  private described(): Modifier[] {
    if (/^(?:Manual|Tome) of /.test(this.name)) return [];
    const modifiers: Modifier[] = [];
    for (const sentence of sentencesOf(this.description)) {
      if (SOMETIMES.test(sentence.replace(EQUIPPED, ""))) continue;
      for (const [, value, names] of sentence.matchAll(SKILL_BONUS)) {
        const skills = names.split(/,? and |, /);
        if (!skills.every((skill) => isOneOf(skill, SKILL_NAMES))) continue;
        modifiers.push(...skills.map((skill) => bonus(`skills.${stripSeparators(skill)}.misc`, Number(value))));
      }
      for (const [, value] of sentence.matchAll(SAVES_BONUS)) modifiers.push(bonus("saves.*.misc", Number(value)));
      for (const [, value] of sentence.matchAll(INITIATIVE_BONUS))
        modifiers.push(bonus("combat.initiative.misc", Number(value)));
    }
    return modifiers;
  }

  /** The modifiers its name gives. */
  private named(): Modifier[] {
    for (const [pattern, modifiers] of NAMED_BONUSES) {
      const match = this.name.match(pattern);
      if (match) return modifiers(Number(match[1]));
    }
    const match = this.name.match(/^(?:Belt|Headband) of (.+) \+(\d+)$/);
    if (!match) return [];
    // Its ending: its last two words ("physical perfection"), else its last ("giant strength": strength)
    const words = match[1].toLowerCase().split(" ");
    const abilities = NAMED_ABILITIES[words.slice(-2).join(" ")] ?? NAMED_ABILITIES[words.at(-1)!] ?? [];
    return abilities.map((name) => bonus(`abilities.${name.toLowerCase()}.misc`, Number(match[2])));
  }

  /** Its modifiers: its name's, then its description's, each target once (its name's first). */
  modifiers(): Modifier[] {
    const all = [...this.named(), ...this.described()];
    return all.filter((modifier, index) => all.findIndex(({ target }) => target === modifier.target) === index);
  }
}
