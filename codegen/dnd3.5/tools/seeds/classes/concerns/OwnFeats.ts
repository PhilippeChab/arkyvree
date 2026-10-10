import {
  type BaseClassSeeds,
  type MappedFeature,
  type PerLevelExpansion,
} from "@/codegen/dnd3.5/tools/seeds/classes/BaseClassSeeds.ts";
import { GrantText } from "@/codegen/dnd3.5/tools/seeds/GrantText.ts";
import { findClassFeatFamilies } from "@/codegen/dnd3.5/tools/terms/classFeatFamilies.ts";
import { insertOrdinalInName } from "@/codegen/dnd3.5/tools/text/names.ts";
import { normalizeDescription } from "@/codegen/dnd3.5/tools/text/scrapedText.ts";
import { type ClassReference } from "@/codegen/dnd3.5/tools/types/classes.ts";
import type { ModifierSeed, RequirementEntry } from "@/content/core/builders/customization/types.ts";
import type { FeatSeed } from "@/content/core/builders/feats/types.ts";
import { grantFeat } from "@/content/dnd3.5/builders/feats/possession.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { stripSeparators } from "@/shared/text.ts";
import { FAVORED_ENEMY_FAMILY } from "@/vocabulary/dnd3.5/feats.ts";
import { FEAT_FAMILY } from "@/vocabulary/dnd3.5/properties/index.ts";

/**
 * The creature type of each feature granting a locked favored enemy ("Favored Enemy (Giant)"), by its mapping's key
 * and its name, lowercased: its feat gets the shared variant through a modifier.
 */
function lockedFavoredEnemiesOf({ mapping, detected }: ClassReference): Map<string, string> {
  const lockedFavoredEnemies = new Map<string, string>();
  for (const { featureName, creatureType } of detected.lockedFavoredEnemies ?? []) {
    const key = mapping.occurrenceMap?.[featureName];
    if (key) lockedFavoredEnemies.set(key.toLowerCase(), creatureType);
    lockedFavoredEnemies.set(featureName.toLowerCase(), creatureType);
  }
  return lockedFavoredEnemies;
}

/**
 * A feature giving a pick at several levels, as a feat per pick (`expansions`): its first, second… named by its
 * ordinal, its `perLevelModifier` targeting the pick's own aptitude, open from the pick's first level.
 */
function perLevelFeatSeeds(
  levelRequirement: (level: number) => RequirementEntry[],
  name: string,
  { description, aptitudes }: Pick<FeatSeed, "description" | "aptitudes">,
  feature: MappedFeature,
  perLevelModifier: ModifierSeed,
  expansions: PerLevelExpansion[],
): FeatSeed[] {
  return expansions.map((expansion) => {
    const minLevel = Math.min(...expansion.levels);
    return {
      name: insertOrdinalInName(name, expansion.ordinal),
      description,
      selectable: false,
      aptitudes,
      ...(feature.modifiers?.length
        ? {
            modifiers: feature.modifiers.map((m) =>
              m.target === perLevelModifier.target ? { ...m, target: expansion.newTarget } : m,
            ),
          }
        : {}),
      ...(minLevel > 1 ? { requirements: levelRequirement(minLevel) } : {}),
    };
  });
}

/** A class's own feats: its features, other than the existing feats it grants. */
export function OwnFeats<B extends Constructor<BaseClassSeeds>>(Base: B) {
  abstract class WithOwnFeats extends Base {
    /**
     * The class's own feats: its features (other than the existing feats it grants), one per level for a feature that
     * gives a pick at several (its first, second… pick).
     */
    protected ownFeats(): FeatSeed[] {
      const { mapping } = this.ref;
      const { aptitudeMinLevel, remap: aptitudeTargetRemap, perLevel: perLevelExpansion } = this.picks();
      const lockedFavoredEnemies = lockedFavoredEnemiesOf(this.ref);

      const feats: FeatSeed[] = [];
      for (const [key, feature] of Object.entries(mapping.features)) {
        if (feature.skip) continue;
        const name = this.featName(key, feature);
        const lockedType = lockedFavoredEnemies.get(key.toLowerCase());
        // An existing feat the class grants is a free feat, not one of its own.
        if (!lockedType && this.existingFeatGranted(name, feature.description)) continue;

        const description = normalizeDescription(feature.description ?? "");
        const aptitudes = [feature.aptitude ?? mapping.classFeatureAptitude, ...(feature.sharedAptitudes ?? [])];
        const perLevelModifier = feature.modifiers?.find((m) => perLevelExpansion.has(m.target));
        if (perLevelModifier) {
          const expansions = perLevelExpansion.get(perLevelModifier.target) ?? [];
          feats.push(
            ...perLevelFeatSeeds(
              (level) => this.classLevelRequirement(level),
              name,
              { description, aptitudes },
              feature,
              perLevelModifier,
              expansions,
            ),
          );
          continue;
        }

        const modifiers: ModifierSeed[] = [
          ...(feature.modifiers ?? []).map((m) => ({ ...m, target: aptitudeTargetRemap.get(m.target) ?? m.target })),
          ...new GrantText(name, feature.description ?? "").companionModifiers(),
          ...new GrantText(name).uncannyDodgeModifiers(),
          ...(lockedType ? [grantFeat(`Favored Enemy: ${lockedType}`)] : []),
        ];
        // A pick in a pool of the class's own (not its class features) opens at the pool's first pick.
        const poolLevel =
          feature.aptitude && feature.aptitude !== mapping.classFeatureAptitude
            ? aptitudeMinLevel.get(stripSeparators(feature.aptitude))
            : undefined;
        const requirements = [
          ...(feature.requirements ?? []),
          ...(poolLevel != null && poolLevel > 1 ? this.classLevelRequirement(poolLevel) : []),
        ];
        const isAutoGranted = feature.level != null && !feature.aptitude;
        const families = lockedType ? [FAVORED_ENEMY_FAMILY] : findClassFeatFamilies(name);
        feats.push({
          name,
          description,
          ...(feature.stackable || lockedType ? { stackable: true } : {}),
          ...(feature.selectable
            ? { selectable: true }
            : feature.selectable === false || isAutoGranted || lockedType
              ? { selectable: false }
              : {}),
          aptitudes,
          ...(modifiers.length > 0 ? { modifiers } : {}),
          ...(requirements.length > 0 ? { requirements } : {}),
          ...(families.length > 0 ? { properties: families.map((value) => ({ type: FEAT_FAMILY, value })) } : {}),
        });
      }

      return feats;
    }
  }
  return WithOwnFeats;
}
