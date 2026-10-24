import { CharacterComponent } from "@/engine/core/character/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Language } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import { stripSeparators } from "@/shared/text.ts";

/** A language as the character's target paths read it: whether the character speaks it, picked or granted. */
interface LanguageEntry {
  known: boolean;
}

/**
 * What the languages' target paths read: each of the ruleset's languages by its slug (`languages.<slug>.known`), and
 * the languages the character may pick past those its Intelligence and its Speak Language ranks give it
 * (`languages.extrapicks`), an input a modifier adds to (a loremaster's 4th level).
 */
interface LanguagesData {
  [slug: string]: LanguageEntry | number;
  extrapicks: number;
}

/** Two languages by their names, A to Z. */
function byName(a: Language, b: Language) {
  return a.name.localeCompare(b.name);
}

/**
 * A character's languages: an entry for each of the ruleset's, known when the character picked it (its rows') or a
 * modifier grants it (`languages.<slug>.known` set true, as it applies in the build's rounds behind its requirements: a
 * race's automatic languages, a druid's Druidic), which a requirement reads however it was gained; and the extra picks
 * its modifiers give.
 */
export default class LanguagesComponent extends CharacterComponent<LoadedCharacterData> {
  private readonly data: LanguagesData = { extrapicks: 0 };

  /** The ids of the languages a modifier grants the character (`grant`). */
  private readonly grantedIds = new Set<string>();

  /** Each of the ruleset's languages the paths reach, by its slug. */
  private readonly languages = new Map<string, Language>();

  /**
   * An entry for each of the ruleset's languages, known when the character picked it (`languages`): a modifier that
   * grants one sets it known as it applies. A slug the data holds already (the extra picks', another language's) keeps
   * its value.
   */
  override initialize({ languages }: Pick<LoadedCharacterData, "languages">, { rulesetData }: RulesetView) {
    const pickedIds = new Set(languages.map(({ id }) => id));
    for (const language of Dnd35View.of(rulesetData).languages) {
      const slug = stripSeparators(language.name);
      if (slug in this.data) continue;
      this.languages.set(slug, language);
      this.data[slug] = { known: pickedIds.has(language.id) };
    }
  }

  /** The languages the character may pick past those its Intelligence and Speak Language ranks give it. */
  getExtraPicks(): number {
    return this.data.extrapicks;
  }

  /** The languages a modifier grants the character, which it speaks without a pick, by name. */
  getGranted(): Language[] {
    return this.getSpoken().filter(({ id }) => this.grantedIds.has(id));
  }

  getLanguages(): LanguagesData {
    return this.data;
  }

  /** Every language the character speaks, as its entry reads once modifiers apply: those granted, then the others, by name. */
  getSpoken(): Language[] {
    const spoken = [...this.languages]
      .filter(([slug]) => {
        const entry = this.data[slug];
        return typeof entry === "object" && entry.known;
      })
      .map(([, language]) => language);
    return [
      ...spoken.filter(({ id }) => this.grantedIds.has(id)).toSorted(byName),
      ...spoken.filter(({ id }) => !this.grantedIds.has(id)).toSorted(byName),
    ];
  }

  /**
   * Records a language (`languageId`) a modifier grants the character, which set it known as it applied: one it speaks
   * without a pick.
   */
  grant(languageId: string): void {
    this.grantedIds.add(languageId);
  }
}
