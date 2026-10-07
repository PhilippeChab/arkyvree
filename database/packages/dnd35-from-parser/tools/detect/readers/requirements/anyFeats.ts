/**
 * What a prerequisite asking for any feat of a family checks: "any metamagic feat" a family the rules name
 * (`FEAT_FAMILIES`), "Weapon Focus (any thrown weapon)" one a feat's options make.
 */

import { NUMBER_WORDS } from "@/database/packages/dnd35-from-parser/tools/text/scrapedText.ts";
import { eq, gte } from "@/database/packages/dnd35/content/customization/requirements.ts";
import type { RequirementEntry } from "@/database/packages/dnd35/content/customization/types.ts";
import { FEAT_FAMILIES } from "@/shared/dnd3.5/feats.ts";
import { stripSeparators } from "@/shared/text.ts";

/**
 * Any feat of the family a feat with options leads ("Weapon Focus (any thrown weapon)", "Spell Focus in two schools
 * of magic": two of them), or none when the text names no feat.
 */
export function readAnyFeatRequirement(text: string): RequirementEntry | undefined {
  // "FeatFamily (any category)", or prose like "Spell Focus in two schools of magic" → the leading feat family
  const family = text.match(/^(.+?)\s*\(/)?.[1] ?? text.match(/^(.+?)\s+(?:in\s+)?\b(?:any|two)\b/i)?.[1];
  if (!family) return undefined;
  const slug = stripSeparators(family.trim());
  // "Spell Focus (two schools of magic)": two of the family's feats
  return /\btwo\s+\w/i.test(text) ? gte(`feats.${slug}.count`, 2) : eq(`feats.${slug}.*.possessed`);
}

/** "Any (other) metamagic feat": one feat of the family; "any two luck feats": that many of them. */
export function readFamilyFeatRequirements(text: string): RequirementEntry[] {
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
