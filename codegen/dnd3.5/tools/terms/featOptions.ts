/** What a family of feats is taken for: a weapon feat's weapons, a spell school feat's schools, Skill Focus's skills. */

import { stripSeparators } from "@/shared/text.ts";
import { SKILLS_WITH_CHECKS } from "@/vocabulary/dnd3.5/skills.ts";
import { SPELL_SCHOOLS } from "@/vocabulary/dnd3.5/spells.ts";
import { ALL_WEAPONS } from "@/vocabulary/dnd3.5/weapons.ts";

/** Each family of feats taken for an option, and the names its options take. */
const FEAT_OPTIONS: { family: RegExp; names: readonly string[] }[] = [
  { family: /^(?:Greater )?Weapon (?:Focus|Specialization)$|^Improved Critical$/i, names: ALL_WEAPONS },
  { family: /^(?:Greater )?Spell Focus$/i, names: SPELL_SCHOOLS },
  { family: /^Skill Focus$/i, names: SKILLS_WITH_CHECKS },
];

/** The feat of a family a name takes with its option ("Skill Focus (Bluff)": Skill Focus: Bluff), if any. */
export function findFamilyFeat(name: string): string | undefined {
  const [, family, option] = /^(.+?)\s*\((.+)\)$/.exec(name) ?? [];
  const names = family ? getFeatOptions(family) : [];
  const optionName = names.length > 0 ? findOptionName(option, names) : undefined;
  return optionName ? `${family}: ${optionName}` : undefined;
}

/** The name an option is among `names`: its own, or the one whose words its words start ("punch dagger", "Necro."). */
export function findOptionName(option: string, names: readonly string[]): string | undefined {
  const exact = names.find((name) => stripSeparators(name) === stripSeparators(option));
  if (exact) return exact;
  const words = option.replace(/\.$/, "").toLowerCase().split(/\s+/);
  const started = names.filter((name) => {
    const nameWords = name.toLowerCase().split(/\s+/);
    return nameWords.length === words.length && nameWords.every((word, i) => word.startsWith(words[i]));
  });
  return started.length === 1 ? started[0] : undefined;
}

/** The names a family of feats' options take: none for a family not taken for an option. */
export function getFeatOptions(family: string): readonly string[] {
  return FEAT_OPTIONS.find((options) => options.family.test(family))?.names ?? [];
}
