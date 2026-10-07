/** A class's features by level, and the existing feats a feature grants instead of being a feat of its own. */

import { extractGrantedFeatNames } from "@/database/packages/dnd35-from-parser/tools/detect/grants.ts";
import ExistingFeats from "@/database/packages/dnd35-from-parser/tools/seeds/ExistingFeats.ts";
import {
  getPluralVariants,
  isPluralVariantOf,
  stripClassSuffix,
} from "@/database/packages/dnd35-from-parser/tools/text/names.ts";
import { type ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";

/** Build a map from pool parent variant names (lowercase) → mapping seedName.
 *  Used to resolve occurrences like "Special Ability" to "Special Abilities (Rogue)". */
export function buildPoolParentNameMap(
  mf: ClassReference["mapping"]["features"],
  className: string,
  classFeatureAptitude: string,
): Map<string, string> {
  const nameMap = new Map<string, string>();
  // Collect unique aptitude groups
  const seen = new Set<string>();
  for (const feat of Object.values(mf)) {
    if (!feat.aptitude || feat.aptitude === classFeatureAptitude) continue;
    if (seen.has(feat.aptitude)) continue;
    seen.add(feat.aptitude);
    const suffix = feat.aptitude.replace(new RegExp(`^${className}\\s+`, "i"), "");
    const s = suffix.toLowerCase();
    // Find the mapping entry whose key matches one of the variants (the pool parent itself)
    const parentEntry = Object.entries(mf).find(([key]) => isPluralVariantOf(s, key));
    if (!parentEntry) continue;
    const seedName = parentEntry[1].seedName ?? `${parentEntry[0]} (${className})`;
    // Map all variants to this seedName
    for (const variant of getPluralVariants(s)) {
      nameMap.set(variant, seedName);
    }
  }
  return nameMap;
}

/**
 * The existing feat a class's feature named `name` grants instead of being a feat of its own: that feat (with or without
 * the class's suffix), or one its description says it gains as a bonus feat.
 */
export function findExistingFeatGranted(ref: ClassReference, name: string, description: string | undefined) {
  const book = ref._meta.book;
  const baseName = stripClassSuffix(name, ref.raw.name);
  return (
    (baseName && ExistingFeats.find(book, baseName)) ||
    ExistingFeats.find(book, name) ||
    (description
      ? extractGrantedFeatNames(description)
          .map((n) => ExistingFeats.find(book, n))
          .find(Boolean)
      : undefined)
  );
}

/** Insert an ordinal suffix before the parenthetical class suffix in a feat name. */
export function insertOrdinalInName(name: string, ordinal: string): string {
  const match = name.match(/^(.+?)(\s*\(.+\))$/);
  if (match) return `${match[1]} ${ordinal}${match[2]}`;
  return `${name} ${ordinal}`;
}
