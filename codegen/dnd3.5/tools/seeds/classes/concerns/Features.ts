import type { BaseClassSeeds } from "@/codegen/dnd3.5/tools/seeds/classes/BaseClassSeeds.ts";
import { getPluralVariants, insertOrdinalInName, isPluralVariantOf } from "@/codegen/dnd3.5/tools/text/names.ts";
import { type ClassReference } from "@/codegen/dnd3.5/tools/types/classes.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Build a map from pool parent variant names (lowercase) → mapping seedName.
 *  Used to resolve occurrences like "Special Ability" to "Special Abilities (Rogue)". */
function buildPoolParentNameMap(
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
    for (const variant of getPluralVariants(s)) nameMap.set(variant, seedName);
  }
  return nameMap;
}

function findMappedName(rawName: string, features: ClassReference["mapping"]["features"]): string | undefined {
  if (!features) return undefined;
  // Exact match
  if (features[rawName]) return features[rawName].seedName;

  // Case-insensitive match
  const lower = rawName.toLowerCase();
  for (const [key, val] of Object.entries(features)) if (key.toLowerCase() === lower) return val.seedName;

  return undefined;
}

/** A class's features by level, and the existing feats a feature grants instead of being a feat of its own. */
export function Features<B extends Constructor<BaseClassSeeds>>(Base: B) {
  abstract class WithFeatures extends Base {
    /**
     * The class's features, each at its levels, and the existing feats it grants (its free feats), a feature split per
     * level named as the split of its pick names it.
     */
    protected classFeatures(): { autoFreeFeats: [number, string, string][]; classFeatures: [number, string][] } {
      const features: [number, string][] = [];
      const autoFreeFeats: [number, string, string][] = [];
      const { detected, mapping, raw } = this.ref;
      const features_ = mapping.features;
      const perLevelPicks = this.picks().perLevel;
      const poolParentNames = buildPoolParentNameMap(features_, raw.name, mapping.classFeatureAptitude);

      // Build per-level feat name map for multi-occurrence aptitude expansions
      const perLevelFeatNames = new Map<string, Map<number, string>>();
      for (const [key, feat] of Object.entries(features_)) {
        if (!feat.modifiers) continue;
        for (const mod of feat.modifiers) {
          if (perLevelPicks.has(mod.target)) {
            const baseName = this.featName(key, feat);
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

        const freeFeatName = this.existingFeatGranted(name, feature?.description);
        if (freeFeatName && mapping.classFeatureAptitude) {
          for (const level of occ.levels) autoFreeFeats.push([level, freeFeatName, mapping.classFeatureAptitude]);
        } else {
          // Check for per-level split names
          const resolvedKey = mappingKey?.toLowerCase() ?? occ.name.toLowerCase();
          const levelMap = perLevelFeatNames.get(resolvedKey);
          for (const level of occ.levels) features.push([level, levelMap?.get(level) ?? name]);
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
        const name = this.featName(key, feat);
        const freeFeatName = this.existingFeatGranted(name, feat.description);
        if (freeFeatName && mapping.classFeatureAptitude)
          autoFreeFeats.push([feat.level, freeFeatName, mapping.classFeatureAptitude]);
        else features.push([feat.level, name]);
      }

      features.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
      autoFreeFeats.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
      return { classFeatures: features, autoFreeFeats };
    }
  }
  return WithFeatures;
}
