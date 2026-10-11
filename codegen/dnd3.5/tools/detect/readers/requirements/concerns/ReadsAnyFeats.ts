import type { BaseRequirementReading } from "@/codegen/dnd3.5/tools/detect/readers/requirements/BaseRequirementReading.ts";
import { NUMBER_WORDS } from "@/codegen/dnd3.5/tools/terms/numbers.ts";
import { eq, gte } from "@/content/core/builders/customization/requirements.ts";
import type { RequirementEntry } from "@/content/core/builders/customization/types.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { stripSeparators } from "@/shared/text.ts";
import { FEAT_FAMILIES } from "@/vocabulary/dnd3.5/feats.ts";

/**
 * A feat with options a prerequisite asks any of (or a number of): "Weapon Focus (any thrown weapon)", "Spell Focus in
 * two schools of magic", "Weapon Focus (with deity's favored weapon)".
 */
const ANY_OPTION = /\(any\b|\bany\b|\btwo\s+(schools?|weapons?|domains?|powers?|skills?|feats?)\b|\bdeity'?s?\b/i;

/**
 * Reading what a prerequisite asking for any feat of a family checks: "any metamagic feat" a family the rules name
 * (`FEAT_FAMILIES`), "Weapon Focus (any thrown weapon)" one a feat's options make.
 */
export function ReadsAnyFeats<B extends Constructor<BaseRequirementReading>>(Base: B) {
  abstract class ReadingAnyFeats extends Base {
    /**
     * Any feat of the family a feat with options leads ("Weapon Focus (any thrown weapon)", "Spell Focus in two schools
     * of magic": two of them), or none when the text names no feat.
     */
    protected anyFeatRequirement(text: string): RequirementEntry | undefined {
      // "FeatFamily (any category)", or prose like "Spell Focus in two schools of magic" → the leading feat family
      const family = text.match(/^(.+?)\s*\(/)?.[1] ?? text.match(/^(.+?)\s+(?:in\s+)?\b(?:any|two)\b/i)?.[1];
      if (!family) return undefined;
      const slug = stripSeparators(family.trim());
      // "Spell Focus (two schools of magic)": two of the family's feats
      return /\btwo\s+\w/i.test(text) ? gte(`feats.${slug}.count`, 2) : eq(`feats.${slug}.*.possessed`);
    }

    /**
     * Whether a feat prerequisite asks for any of a feat's options, or a number of them (`ANY_OPTION`), which
     * `anyFeatRequirement` reads.
     */
    protected asksAnyOption(text: string): boolean {
      return ANY_OPTION.test(text);
    }

    /** "Any (other) metamagic feat": one feat of the family; "any two luck feats": that many of them. */
    protected familyFeatRequirements(text: string): RequirementEntry[] {
      const counts = Object.keys(NUMBER_WORDS).join("|");
      return FEAT_FAMILIES.flatMap((family) => {
        const match = new RegExp(`\\bany (?:other )?(?:(${counts}) )?${family} feats?\\b`, "i").exec(text);
        if (!match) return [];
        const slug = stripSeparators(family);
        return [
          match[1] ? gte(`feats.${slug}.count`, NUMBER_WORDS[match[1].toLowerCase()]) : eq(`feats.${slug}.*.possessed`),
        ];
      });
    }
  }
  return ReadingAnyFeats;
}
