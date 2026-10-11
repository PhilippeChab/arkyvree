import { sanitizeJsonValues } from "@/codegen/dnd3.5/tools/text/sanitize.ts";
import type { RaceReference } from "@/codegen/dnd3.5/tools/types/races.ts";

import { BaseDetector } from "./BaseDetector.ts";
import { LanguageText } from "./readers/languages/LanguageText.ts";
import { RaceModifiers } from "./readers/modifiers/RaceModifiers.ts";

/**
 * The languages a race's traits have it speak from the start (`LanguageText`: its automatic languages). When they name
 * none, why, naming the race, unless its override gives its languages (`overridden`: the human's and the halfling's
 * pages have no traits), so a re-scrape that loses a race's languages fails validation until it's reviewed.
 */
function detectLanguages(
  entry: RaceReference["raw"][number],
  overridden: boolean,
): Pick<RaceReference["detected"][string], "languages" | "unresolvedLanguages"> {
  const text = entry.features.map(({ name, description }) => `${name}: ${description}`).join(" ");
  const { automatic } = new LanguageText(text).read();
  if (automatic.length > 0) return { languages: automatic };
  return overridden ? {} : { unresolvedLanguages: [`No languages: ${entry.name}'s traits name none`] };
}

/**
 * A race reference's detector: each race's modifiers (its ability adjustments, its traits' bonuses) and languages
 * (`detected`), read from its page sanitized, and its description, modifiers and languages, its overrides applied
 * (`mapping`).
 */
export class RaceDetector extends BaseDetector<RaceReference> {
  constructor(stored: Pick<RaceReference, "_meta" | "overrides" | "raw">) {
    super(stored);
    this.races = sanitizeJsonValues(stored.raw);
  }

  /** The races its page gives, sanitized. */
  private readonly races: RaceReference["raw"];

  /** Each race's detected modifiers and languages. */
  protected override detected(): RaceReference["detected"] {
    const modifiers = this.modifiersOf(this.races, (entry) => new RaceModifiers(entry));
    return Object.fromEntries(
      this.races.map((entry) => [
        entry.name,
        { ...modifiers[entry.name], ...detectLanguages(entry, !!this.stored.overrides?.[entry.name]?.languages) },
      ]),
    );
  }

  /**
   * Each race as the seeds make it: its description, modifiers and languages, its name, size and speed, its override's
   * or else what's scraped and detected; the properties its override gives, and whether its override skips it.
   */
  protected override mapping(detected: RaceReference["detected"]): RaceReference["mapping"] {
    return this.modifierMapping(
      this.races,
      detected,
      this.stored.overrides ?? {},
      (override: NonNullable<RaceReference["overrides"]>[string] | undefined, entry: RaceReference["raw"][number]) => {
        const languages = override?.languages ?? detected[entry.name]?.languages;
        return {
          name: override?.name ?? entry.name,
          size: override?.size ?? entry.size,
          baseSpeed: override?.baseSpeed ?? entry.baseSpeed,
          ...(languages ? { languages } : {}),
          ...(override?.properties?.length ? { properties: override.properties } : {}),
          ...(override?.skip ? { skip: true } : {}),
        };
      },
    );
  }
}
