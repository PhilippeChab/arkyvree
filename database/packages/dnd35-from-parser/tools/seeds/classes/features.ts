/** A class's features by level, and the existing feats a feature grants instead of being a feat of its own. */

import { extractGrantedFeatNames } from "@/database/packages/dnd35-from-parser/tools/detect/grants.ts";
import type { getClassAptitudePicks } from "@/database/packages/dnd35-from-parser/tools/seeds/classes/aptitudePicks.ts";
import ExistingFeats from "@/database/packages/dnd35-from-parser/tools/seeds/ExistingFeats.ts";
import {
  getPluralVariants,
  isPluralVariantOf,
  stripClassSuffix,
} from "@/database/packages/dnd35-from-parser/tools/text/names.ts";
import { type ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";

function findMappedName(rawName: string, features: ClassReference["mapping"]["features"]): string | undefined {
  if (!features) return undefined;
  // Exact match
  if (features[rawName]) return features[rawName].seedName;

  // Case-insensitive match
  const lower = rawName.toLowerCase();
  for (const [key, val] of Object.entries(features)) {
    if (key.toLowerCase() === lower) return val.seedName;
  }

  return undefined;
}

/** A class's features and the existing feats it grants, a feature split per level named as `perLevelPicks` splits its pick. */
export function buildClassFeatures(
  ref: ClassReference,
  perLevelPicks: ReturnType<typeof getClassAptitudePicks>["perLevel"],
): {
  classFeatures: [number, string][];
  autoFreeFeats: [number, string, string][];
} {
  const features: [number, string][] = [];
  const autoFreeFeats: [number, string, string][] = [];
  const { detected, mapping } = ref;
  const features_ = ref.mapping.features;
  const poolParentNames = buildPoolParentNameMap(features_, ref.raw.name, mapping.classFeatureAptitude);

  // Build per-level feat name map for multi-occurrence aptitude expansions
  const perLevelFeatNames = new Map<string, Map<number, string>>();
  for (const [key, feat] of Object.entries(features_)) {
    if (!feat.modifiers) continue;
    for (const mod of feat.modifiers) {
      if (perLevelPicks.has(mod.target)) {
        const baseName = feat.seedName ?? (feat.aptitude ? `${key} (${feat.aptitude})` : key);
        const levelMap = new Map<number, string>();
        for (const exp of perLevelPicks.get(mod.target)!) {
          const perLevelName = insertOrdinalInName(baseName, exp.ordinal);
          for (const level of exp.levels) levelMap.set(level, perLevelName);
        }
        perLevelFeatNames.set(key.toLowerCase(), levelMap);
      }
    }
  }

  for (const occ of detected.featureOccurrences) {
    const mappingKey = mapping.occurrenceMap?.[occ.name];
    const feature = mappingKey ? features_[mappingKey] : undefined;
    if (feature?.skip) continue;

    const mappedName = feature?.seedName ?? findMappedName(occ.name, features_);
    const name = mappedName ?? poolParentNames.get(occ.name.toLowerCase()) ?? occ.name;

    const freeFeatName = findExistingFeatGranted(ref, name, feature?.description);
    if (freeFeatName && mapping.classFeatureAptitude) {
      for (const level of occ.levels) autoFreeFeats.push([level, freeFeatName, mapping.classFeatureAptitude]);
    } else {
      // Check for per-level split names
      const resolvedKey = mappingKey?.toLowerCase() ?? occ.name.toLowerCase();
      const levelMap = perLevelFeatNames.get(resolvedKey);
      for (const level of occ.levels) {
        features.push([level, levelMap?.get(level) ?? name]);
      }
    }
  }

  // Add mapping features that have a level but no matching occurrence
  // (e.g. "Weapon and Armor Proficiency" — not in progression table, only in class features text)
  const coveredKeys = new Set<string>();
  for (const occ of detected.featureOccurrences) {
    const key = mapping.occurrenceMap?.[occ.name] ?? occ.name;
    coveredKeys.add(key.toLowerCase());
  }
  for (const [key, feat] of Object.entries(features_)) {
    if (feat.skip || feat.level == null || coveredKeys.has(key.toLowerCase())) continue;
    if (feat.aptitude && feat.aptitude !== mapping.classFeatureAptitude) continue;
    const name = feat.seedName ?? key;
    const freeFeatName = findExistingFeatGranted(ref, name, feat.description);
    if (freeFeatName && mapping.classFeatureAptitude) {
      autoFreeFeats.push([feat.level, freeFeatName, mapping.classFeatureAptitude]);
    } else {
      features.push([feat.level, name]);
    }
  }

  features.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  autoFreeFeats.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  return { classFeatures: features, autoFreeFeats };
}

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
