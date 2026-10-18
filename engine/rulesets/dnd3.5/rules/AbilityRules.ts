import { sortByOrder } from "@/shared/sortByOrder.ts";
import { stripSeparators } from "@/shared/text.ts";
import { ABILITY_MODIFIER_DIVISOR, ABILITY_MODIFIER_OFFSET, ABILITY_NAMES } from "@/vocabulary/dnd3.5/abilities.ts";

/** The books' abilities' slugs, in their order: a sheet lists them first. */
const BOOK_ABILITY_SLUGS = ABILITY_NAMES.map((name) => stripSeparators(name));

/** The 3.5 ability rules: what a score gives, and the order a sheet lists the abilities in. */
export default class AbilityRules {
  /** An ability's modifier at a score: +1 for every 2 points above 10, rounded down (a score of 9 is -1). */
  static computeModifier(score: number): number {
    return Math.floor((score - ABILITY_MODIFIER_OFFSET) / ABILITY_MODIFIER_DIVISOR);
  }

  /** Whether an ability (by its slug, `strength`) is one of the books' six. */
  static isBookAbility(slug: string): boolean {
    return BOOK_ABILITY_SLUGS.includes(slug);
  }

  /**
   * `abilities` in the order a sheet lists them: the books' six in theirs (Strength, Dexterity…), then the others by
   * name ("Force Points", "Sanity"), whatever order their rows came in. `nameOf` gives each one's name.
   */
  static orderAbilities<T>(abilities: readonly T[], nameOf: (ability: T) => string): T[] {
    const byName = abilities.toSorted((a, b) => nameOf(a).localeCompare(nameOf(b)));
    return sortByOrder(byName, BOOK_ABILITY_SLUGS, (ability) => stripSeparators(nameOf(ability)));
  }
}
