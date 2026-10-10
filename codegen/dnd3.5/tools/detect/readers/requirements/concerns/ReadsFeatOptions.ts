import type { BaseRequirementReading } from "@/codegen/dnd3.5/tools/detect/readers/requirements/BaseRequirementReading.ts";
import { findOptionName, getFeatOptions } from "@/codegen/dnd3.5/tools/terms/featOptions.ts";
import { eq } from "@/content/core/builders/customization/requirements.ts";
import type { RequirementEntry } from "@/content/core/builders/customization/types.ts";
import { feat } from "@/content/dnd3.5/builders/feats/possession.ts";
import { proficiencyRequirements } from "@/content/dnd3.5/builders/items/proficiencies.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { stripSeparators } from "@/shared/text.ts";
import { ALL_WEAPONS } from "@/vocabulary/dnd3.5/weapons.ts";

/**
 * Feats taken with a choice that isn't a feat of its own: "Energy Substitution (cold)" requires Energy Substitution.
 */
const FEATS_WITH_A_CHOICE = ["Energy Substitution"];

/**
 * Reading the options a prerequisite names a feat with: a family's ("dagger or kukri"), a choice of a feat's own, a
 * weapon's proficiency.
 */
export function ReadsFeatOptions<B extends Constructor<BaseRequirementReading>>(Base: B) {
  abstract class ReadingFeatOptions extends Base {
    /**
     * The proficiency an exotic weapon's proficiency names ("Exotic Weapon Proficiency (kukri)"), as its item requires
     * it: a martial weapon's for one the books list as exotic, a race's familiarity; none for any other name.
     */
    protected exoticProficiencyRequirements(name: string): RequirementEntry[] {
      const weapon = findOptionName(/^Exotic Weapon Proficiency \((.+)\)$/i.exec(name)?.[1] ?? "", ALL_WEAPONS);
      return weapon ? proficiencyRequirements(weapon) : [];
    }

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

    /**
     * The weapon proficiency a prerequisite names: with all martial or simple weapons (Martial Weapon Proficiency), or
     * with a weapon ("proficiency with the whip"), as its item requires it; none for anything else ("Proficiency with
     * weapon").
     */
    protected weaponProficiencyRequirements(text: string): RequirementEntry[] {
      const lower = text.toLowerCase();
      if (lower.includes("all martial weapons")) return [eq(feat("Martial Weapon Proficiency"))];
      if (lower.includes("all simple weapons")) return [eq(feat("Simple Weapon Proficiency"))];
      const weapon = /\bproficien(?:t|cy) with (?:the |an? )?([^,.]+)/i.exec(text)?.[1];
      const name = weapon && findOptionName(weapon.trim(), ALL_WEAPONS);
      return name ? proficiencyRequirements(name) : [];
    }
  }
  return ReadingFeatOptions;
}
