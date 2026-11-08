import type { CharacterInput, DescribedLink, LinkRoom } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd5/model/DetailedCharacter.ts";
import Dnd5CharacterBuilder from "@/engine/rulesets/dnd5/model/Dnd5CharacterBuilder.ts";
import LanguageRules from "@/engine/rulesets/dnd5/rules/LanguageRules.ts";
import Dnd5View from "@/engine/rulesets/dnd5/view/Dnd5View.ts";
import type { Language } from "@/engine/rulesets/dnd5/view/rows.ts";
import { LANGUAGE_TYPE } from "@/vocabulary/dnd5/fields/index.ts";

/** A language as a character's languages name it: its id and name. */
function describeLanguage({ id, name }: Language): DescribedLink {
  return { id, name };
}

/**
 * A character's languages, from its rows (`input`): those its modifiers grant it without a pick (`languages.<slug>.known`
 * set true: Common, a druid's Druidic), how many it picks (`LanguageRules`: two, and its extra picks), what one more
 * pick may add, and an edit's picks, a new one refused past that room, or when it's rare past its extra picks. The
 * character is built once, when first read.
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
    return (this.built ??= Dnd5CharacterBuilder.build(this.view, this.input));
  }

  /** The languages a modifier grants the character, which it speaks without a pick. */
  private granted(): Language[] {
    return this.character.components.languages.getGranted();
  }

  /** Whether a language is rare (`LANGUAGE_TYPE`): a feature's pick or grant alone gives it. */
  private isRare(language: Language): boolean {
    return LanguageRules.isRare(language.fields[LANGUAGE_TYPE] ?? "");
  }

  /** The languages of `languageIds` (each the view's) the character picked: those no modifier grants it. */
  private picksOf(languageIds: string[]): Language[] {
    const grantedIds = new Set(this.granted().map(({ id }) => id));
    const { languagesById } = Dnd5View.of(this.view.rulesetData);
    return languageIds
      .filter((languageId) => !grantedIds.has(languageId))
      .flatMap((languageId) => languagesById.get(languageId) ?? []);
  }

  /** How many of the character's picks may be rare: one per extra pick a feature gives. */
  private rareRoom(): number {
    return LanguageRules.rareRoomOf(this.character.components.languages.getExtraPicks());
  }

  /**
   * Why a new pick of `language` can't join `taken` picks (`rare` of them rare), if it can't: a rare language past the
   * extra picks a feature gives, or no room left.
   */
  private refusalOf(language: Language, taken: number, rare: number): string | undefined {
    if (this.isRare(language) && rare >= this.rareRoom())
      return `${language.name} is a rare language: only a feature that gives a language pick lets a character pick it`;
    const room = this.room();
    if (taken >= room)
      return `${language.name} is past the languages the character may pick (${taken} picked, room for ${room})`;
    return undefined;
  }

  /** How many languages the character picks: two, and the extra picks its modifiers add. */
  private room(): number {
    return LanguageRules.roomOf(this.character.components.languages.getExtraPicks());
  }

  /**
   * What the character speaks without a pick, its picks (of `languageIds`, each the view's), and the languages one more
   * pick may add, by name: any while the picks leave room, a rare one while they leave one of its extra picks.
   */
  describe(languageIds: string[]): LinkRoom {
    const granted = this.granted();
    const picks = this.picksOf(languageIds);
    const rare = picks.filter((pick) => this.isRare(pick)).length;
    const taken = new Set([...granted, ...picks].map(({ id }) => id));
    const options = Dnd5View.of(this.view.rulesetData)
      .languages.filter((language) => !taken.has(language.id) && !this.refusalOf(language, picks.length, rare))
      .toSorted((a, b) => a.name.localeCompare(b.name));
    return {
      automatic: granted.map((language) => describeLanguage(language)),
      options: options.map((language) => describeLanguage(language)),
      picks: picks.map((language) => describeLanguage(language)),
    };
  }

  /**
   * The picks an edit stores (of `languageIds`, each the view's): those no modifier grants the character. Those it keeps
   * (its rows' own) are counted first, and never refused; a new pick is refused, naming it, when the room the picks
   * before it leave takes none more, or it's rare and they leave none of the extra picks.
   */
  plan(languageIds: string[]): string[] {
    const picks = this.picksOf(languageIds);
    const keptIds = new Set(this.input.rows.links.speaks.map(({ entityId }) => entityId));
    const kept = picks.filter(({ id }) => keptIds.has(id));
    let taken = kept.length;
    let rare = kept.filter((pick) => this.isRare(pick)).length;
    const refusals: string[] = [];
    for (const pick of picks.filter(({ id }) => !keptIds.has(id))) {
      const refusal = this.refusalOf(pick, taken, rare);
      if (refusal) {
        refusals.push(refusal);
      } else {
        taken++;
        if (this.isRare(pick)) rare++;
      }
    }
    RulesError.refuseIssues(refusals.map((message) => ({ category: "languages", message })));
    return picks.map(({ id }) => id);
  }
}
