/**
 * A race's traits' or a class's languages' text, read for the languages it gives: those spoken from the start, and
 * whether it gives a new one of any kind. Its bonus languages, the lists the SRD has a character pick from, are left
 * out: a character picks any language but a secret one.
 */

/** What a text says of languages, each named as the text names it. */
export interface LanguageReading {
  /** The languages spoken from the start: "Automatic Languages: Common and Dwarven", "also knows Druidic, a secret…" */
  automatic: string[];
  /** It gives a new language of any kind: "can choose any new language", "learn a new language" */
  newLanguage: boolean;
}

/** How a text names the languages spoken from the start: each pattern's first group, a list. */
const AUTOMATIC_PATTERNS = [/\bAutomatic Languages?:\s*([^.]+)\./i, /\balso knows ([A-Z][a-z]+), a secret language/];

/** What separates a list's languages: "Giant, Gnome, and Orc", "Common and Elven", "Draconic or Giant". */
const LIST_SEPARATOR = /,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+/;

/** A text that gives a new language of any kind. */
const NEW_LANGUAGE = /\b(?:any|a) new language\b/i;

/** The languages a list names, in its order: "Giant, Gnome, and Orc" → Giant, Gnome, Orc. */
function splitLanguages(list: string): string[] {
  return list
    .split(LIST_SEPARATOR)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

/** A text read for the languages it gives (`read`). */
export class LanguageText {
  constructor(private readonly text: string) {}

  /** The lists the patterns find in the text, in their order: each pattern's first match's. */
  private lists(patterns: RegExp[]): string[] {
    return patterns.flatMap((pattern) => {
      const list = pattern.exec(this.text)?.[1];
      return list ? [list.trim()] : [];
    });
  }

  /** What the text says of languages: the automatic ones, and whether it gives a new one of any kind. */
  read(): LanguageReading {
    return {
      automatic: this.lists(AUTOMATIC_PATTERNS).flatMap((list) => splitLanguages(list)),
      newLanguage: NEW_LANGUAGE.test(this.text),
    };
  }
}
