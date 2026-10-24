import type { CharacterInput, DescribedLink, LinkRoom } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import Dnd35CharacterBuilder from "@/engine/rulesets/dnd3.5/model/Dnd35CharacterBuilder.ts";
import LanguageRules from "@/engine/rulesets/dnd3.5/rules/LanguageRules.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Language } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import { stripSeparators } from "@/shared/text.ts";
import { LANGUAGE_PICK_ABILITY, SPEAK_LANGUAGE_SKILL } from "@/vocabulary/dnd3.5/languages.ts";

/** A language as a character's languages name it: its id, name and type. */
function describeLanguage({ id, name }: Language): DescribedLink {
  return { id, name };
}

/**
 * A character's languages, from its rows (`input`): those its modifiers grant it without a pick (`languages.<slug>.known`
 * set true: its race's automatic languages, a druid's Druidic), how many it picks (`LanguageRules`: by its permanent
 * Intelligence, its Speak Language ranks, its extra picks), what one more pick may add, and an edit's picks, a new one
 * refused past that room or when it's secret. The character is built once, when first read.
 */
export default class SpokenLanguages {
  constructor(
    private readonly view: RulesetView,
    private readonly input: CharacterInput,
  ) {}

  /** The character, built from its rows. */
  private built?: DetailedCharacter;

  /** The character, built from its rows the first time it's read. */
  private get character() {
    return (this.built ??= Dnd35CharacterBuilder.build(this.view, this.input));
  }

  /** The languages a modifier grants the character, which it speaks without a pick. */
  private granted(): Language[] {
    return this.character.components.languages.getGranted();
  }

  /** The languages of `languageIds` (each the view's) the character picked: those no modifier grants it. */
  private picksOf(languageIds: string[]): Language[] {
    const grantedIds = new Set(this.granted().map(({ id }) => id));
    const { languagesById } = Dnd35View.of(this.view.rulesetData);
    return languageIds
      .filter((languageId) => !grantedIds.has(languageId))
      .flatMap((languageId) => languagesById.get(languageId) ?? []);
  }

  /**
   * Why a new pick of `language` can't join `taken` picks, if it can't: a secret language, which only a modifier grants,
   * or no room left.
   */
  private refusalOf(language: Language, taken: number): string | undefined {
    if (LanguageRules.isSecret(language.type))
      return `${language.name} is a secret language: only a modifier that grants it lets a character speak it`;
    const room = this.room();
    if (taken >= room)
      return `${language.name} is past the languages the character may pick (${taken} picked, room for ${room})`;
    return undefined;
  }

  /**
   * How many languages the character picks: by its permanent Intelligence modifier (its current score with its race's
   * adjustment, an item's bonus aside), its Speak Language ranks and the extra picks its modifiers add.
   */
  private room(): number {
    const { abilities, languages, skills } = this.character.components;
    return LanguageRules.roomOf(
      abilities.getPermanentModifier(LANGUAGE_PICK_ABILITY),
      skills.getSkills()[stripSeparators(SPEAK_LANGUAGE_SKILL)]?.rank ?? 0,
      languages.getExtraPicks(),
    );
  }

  /**
   * What the character speaks without a pick, its picks (of `languageIds`, each the view's), and the languages one more
   * pick may add, by name: any but a secret one, while the picks leave room.
   */
  describe(languageIds: string[]): LinkRoom {
    const granted = this.granted();
    const picks = this.picksOf(languageIds);
    const taken = new Set([...granted, ...picks].map(({ id }) => id));
    const options = Dnd35View.of(this.view.rulesetData)
      .languages.filter((language) => !taken.has(language.id) && !this.refusalOf(language, picks.length))
      .toSorted((a, b) => a.name.localeCompare(b.name));
    return {
      automatic: granted.map((language) => describeLanguage(language)),
      options: options.map((language) => describeLanguage(language)),
      picks: picks.map((language) => describeLanguage(language)),
    };
  }

  /**
   * The picks an edit stores (of `languageIds`, each the view's): those no modifier grants the character. Those it keeps
   * (its rows' own) are counted first, and never refused; a new pick is refused, naming it, when it's secret or the
   * room the picks before it leave takes none more.
   */
  plan(languageIds: string[]): string[] {
    const picks = this.picksOf(languageIds);
    const keptIds = new Set(this.input.rows.links.languages.map(({ languageId }) => languageId));
    let taken = picks.filter(({ id }) => keptIds.has(id)).length;
    const refusals: string[] = [];
    for (const pick of picks.filter(({ id }) => !keptIds.has(id))) {
      const refusal = this.refusalOf(pick, taken);
      if (refusal) refusals.push(refusal);
      else taken++;
    }
    RulesError.refuseIssues(refusals.map((message) => ({ category: "languages", message })));
    return picks.map(({ id }) => id);
  }
}
