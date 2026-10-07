import type { BaseRequirementReading } from "@/codegen/dnd3.5/tools/detect/readers/requirements/BaseRequirementReading.ts";
import { findOptionName, getFeatOptions } from "@/codegen/dnd3.5/tools/vocabulary/featOptions.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { stripSeparators } from "@/shared/text.ts";

/**
 * Feats taken with a choice that isn't a feat of its own: "Energy Substitution (cold)" requires Energy Substitution.
 */
const FEATS_WITH_A_CHOICE = ["Energy Substitution"];

/** Reading the options a prerequisite names a feat with: a family's ("dagger or kukri"), a choice of a feat's own. */
export function ReadsFeatOptions<B extends Constructor<BaseRequirementReading>>(Base: B) {
  abstract class ReadingFeatOptions extends Base {
    /**
     * The options of `family` a prerequisite lists ("dagger, kukri, or punch dagger"), each by its name where it can
     * tell it (Punching Dagger, Necromancy for "Necro."), else as written. "Composite version of either" is the
     * composite of each option before it.
     */
    protected familyOptions(family: string, optionsText: string): string[] {
      const names = getFeatOptions(family);
      const options: string[] = [];
      for (const option of optionsText.split(/,\s*(?:or\s+)?|\s+or\s+/).map((o) => o.trim())) {
        if (!option) continue;
        if (/^composite versions? of (?:either|both|each)$/i.test(option))
          options.push(...options.map((name) => `Composite ${name}`).filter((name) => names.includes(name)));
        else options.push(findOptionName(option, names) ?? option);
      }
      return options;
    }

    /** The feat a prerequisite names with its choice ("Energy Substitution (cold)"), alone; none for any other name. */
    protected featWithoutChoice(name: string): string | undefined {
      const base = /^(.+?)\s*\(/.exec(name)?.[1];
      return base ? FEATS_WITH_A_CHOICE.find((feat) => stripSeparators(feat) === stripSeparators(base)) : undefined;
    }
  }
  return ReadingFeatOptions;
}
