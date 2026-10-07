import { ALL_WEAPONS } from "@/database/packages/dnd35/content/items/weapons.ts";
import { SKILL_NAMES } from "@/database/packages/dnd35/data/skills.ts";
import { SPELL_SCHOOLS } from "@/shared/dnd3.5/spells.ts";
import { stripSeparators } from "@/shared/text.ts";

/** Feats taken with a choice that isn't a feat of its own: "Energy Substitution (cold)" requires Energy Substitution */
const FEATS_WITH_A_CHOICE = ["Energy Substitution"];

/** What a family of feats is taken for: a weapon feat's weapons, a spell school feat's schools, Skill Focus's skills */
const OPTIONS_OF: { family: RegExp; names: readonly string[] }[] = [
  { family: /^(?:Greater )?Weapon (?:Focus|Specialization)$|^Improved Critical$/i, names: ALL_WEAPONS },
  { family: /^(?:Greater )?Spell Focus$/i, names: SPELL_SCHOOLS },
  { family: /^Skill Focus$/i, names: SKILL_NAMES },
];

/** The name an option is: its own, or the one whose words its words start ("punch dagger", "Necro."). */
function nameOf(option: string, names: readonly string[]): string | undefined {
  const exact = names.find((name) => stripSeparators(name) === stripSeparators(option));
  if (exact) return exact;
  const words = option.replace(/\.$/, "").toLowerCase().split(/\s+/);
  const started = names.filter((name) => {
    const nameWords = name.toLowerCase().split(/\s+/);
    return nameWords.length === words.length && nameWords.every((word, i) => word.startsWith(words[i]));
  });
  return started.length === 1 ? started[0] : undefined;
}

/** The feat of a family a name takes with its option ("Skill Focus (Bluff)": Skill Focus: Bluff), if any. */
export function findFamilyFeat(name: string): string | undefined {
  const [, family, option] = /^(.+?)\s*\((.+)\)$/.exec(name) ?? [];
  const names = family ? OPTIONS_OF.find((options) => options.family.test(family))?.names : undefined;
  const optionName = names && nameOf(option, names);
  return optionName ? `${family}: ${optionName}` : undefined;
}

/** The weapon a prerequisite names ("orc double axe"), if any. */
export function findWeapon(text: string) {
  return nameOf(text, ALL_WEAPONS);
}

/**
 * The options of `family` a prerequisite lists ("dagger, kukri, or punch dagger"), each by its name where it can
 * tell it (Punching Dagger, Necromancy for "Necro."), else as written. "Composite version of either" is the
 * composite of each option before it.
 */
export function readFamilyOptions(family: string, optionsText: string): string[] {
  const names = OPTIONS_OF.find((options) => options.family.test(family))?.names ?? [];
  const options: string[] = [];
  for (const option of optionsText.split(/,\s*(?:or\s+)?|\s+or\s+/).map((o) => o.trim())) {
    if (!option) continue;
    if (/^composite versions? of (?:either|both|each)$/i.test(option))
      options.push(...options.map((name) => `Composite ${name}`).filter((name) => names.includes(name)));
    else options.push(nameOf(option, names) ?? option);
  }
  return options;
}

/** The feat a prerequisite names with its choice ("Energy Substitution (cold)"), alone; none for any other name. */
export function stripFeatChoice(name: string): string | undefined {
  const base = /^(.+?)\s*\(/.exec(name)?.[1];
  return base ? FEATS_WITH_A_CHOICE.find((feat) => stripSeparators(feat) === stripSeparators(base)) : undefined;
}
