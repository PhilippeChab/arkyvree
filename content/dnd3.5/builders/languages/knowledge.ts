/**
 * A language's knowledge, as the 3.5 content names and grants it: the path of speaking a language, its grant, and one
 * more language to pick.
 */

import { bonus, setFlag } from "@/content/core/builders/customization/modifiers.ts";
import type { Modifier } from "@/content/core/builders/customization/types.ts";
import { stripSeparators } from "@/shared/text.ts";

/** The language `name` spoken without a pick: what a race or a class grants (a dwarf's Dwarven, a druid's Druidic). */
export function grantLanguage(name: string): Modifier {
  return setFlag(language(name));
}

/** The path of speaking a language. */
export function language(name: string): string {
  return `languages.${stripSeparators(name)}.known`;
}

/** One more language to pick, of any kind but a secret one: what a class level adds (a loremaster's 4th). */
export function languagePick(): Modifier {
  return bonus("languages.extrapicks", 1);
}
