/** A class's own feats: its features, a pick at several levels split per level, and the feat advancing its spellcasting. */

import {
  readCompanionGrantModifiers,
  readUncannyDodgeModifiers,
} from "@/database/packages/dnd35-from-parser/tools/detect/readers/modifiers/grants.ts";
import type { BaseBookSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/BaseBookSeeds.ts";
import { normalizeDescription } from "@/database/packages/dnd35-from-parser/tools/text/scrapedText.ts";
import { type ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import { bonus, grantFeat } from "@/database/packages/dnd35/content/customization/modifiers.ts";
import { gte } from "@/database/packages/dnd35/content/customization/requirements.ts";
import type { ModifierSeed, RequirementEntry } from "@/database/packages/dnd35/content/customization/types.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";
import { FAVORED_ENEMY_FAMILY } from "@/database/packages/dnd35/data/feats/favoredEnemy.ts";
import { FEAT_FAMILY } from "@/shared/dnd3.5/properties/index.ts";
import { stripSeparators } from "@/shared/text.ts";

import { getClassAptitudePicks, type PerLevelExpansion } from "./aptitudePicks.ts";
import { detectClassFeatFamily } from "./featFamilies.ts";
import { findExistingFeatGranted, insertOrdinalInName } from "./features.ts";

/** Having `level` levels in the class `classSlug`. */
function classLevelRequirement(classSlug: string, level: number): RequirementEntry[] {
  return [gte(`classes.${classSlug}.level`, level)];
}

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
  classSlug: string,
  name: string,
  { description, aptitudes }: Pick<FeatSeed, "description" | "aptitudes">,
  feature: ClassReference["mapping"]["features"][string],
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
      ...(minLevel > 1 ? { requirements: classLevelRequirement(classSlug, minLevel) } : {}),
    };
  });
}

/** A spellcasting class's own list gets a feat other classes advance it with: none for any other class. */
function spellcastingAdvanceFeats(ref: ClassReference, classSlug: string): FeatSeed[] {
  const { detected } = ref;
  const { casterType, spells } = ref.mapping;
  // Spells of its own (not `noSpells`), not an advancement of another class's
  if (!spells || !casterType || detected.casterLevelAdvancement) return [];
  return [
    {
      name: `Advance ${ref.raw.name} Spellcasting`,
      description: `Your effective ${classSlug} caster level increases by 1, granting additional spell slots and spells per day as if you had gained a level in ${classSlug}.`,
      stackable: true,
      aptitudes: [
        casterType === "Divine" ? "Bonus Divine Caster Level" : "Bonus Arcane Caster Level",
        "Bonus Caster Level",
      ],
      modifiers: [bonus(`classes.${classSlug}.bonuscasterlevel`, 1)],
      requirements: classLevelRequirement(classSlug, 1),
    },
  ];
}

/**
 * A class's own feats: its class features (other than the existing feats it grants), one per level for a feature
 * that gives a pick at several (its first, second… pick), and the feat advancing its spellcasting.
 */
export function buildClassFeatSeeds(ref: ClassReference, book: BaseBookSeeds): FeatSeed[] {
  const { mapping } = ref;
  const classSlug = stripSeparators(ref.raw.name);
  const { aptitudeMinLevel, remap: aptitudeTargetRemap, perLevel: perLevelExpansion } = getClassAptitudePicks(ref);
  const lockedFavoredEnemies = lockedFavoredEnemiesOf(ref);

  const feats: FeatSeed[] = [];
  for (const [key, feature] of Object.entries(mapping.features)) {
    if (feature.skip) continue;
    const name = feature.seedName ?? (feature.aptitude ? `${key} (${feature.aptitude})` : key);
    const lockedType = lockedFavoredEnemies.get(key.toLowerCase());
    // An existing feat the class grants is a free feat, not one of its own.
    if (!lockedType && findExistingFeatGranted(ref, name, feature.description, book)) continue;

    const description = normalizeDescription(feature.description ?? "");
    const aptitudes = [feature.aptitude ?? mapping.classFeatureAptitude];
    const perLevelModifier = feature.modifiers?.find((m) => perLevelExpansion.has(m.target));
    if (perLevelModifier) {
      const expansions = perLevelExpansion.get(perLevelModifier.target) ?? [];
      feats.push(
        ...perLevelFeatSeeds(classSlug, name, { description, aptitudes }, feature, perLevelModifier, expansions),
      );
      continue;
    }

    const modifiers: ModifierSeed[] = [
      ...(feature.modifiers ?? []).map((m) => ({ ...m, target: aptitudeTargetRemap.get(m.target) ?? m.target })),
      ...readCompanionGrantModifiers(name, feature.description ?? ""),
      ...readUncannyDodgeModifiers(name),
      ...(lockedType ? [grantFeat(`Favored Enemy: ${lockedType}`)] : []),
    ];
    // A pick in a pool of the class's own (not its class features) opens at the pool's first pick.
    const poolLevel =
      feature.aptitude && feature.aptitude !== mapping.classFeatureAptitude
        ? aptitudeMinLevel.get(stripSeparators(feature.aptitude))
        : undefined;
    const requirements = [
      ...(feature.requirements ?? []),
      ...(poolLevel != null && poolLevel > 1 ? classLevelRequirement(classSlug, poolLevel) : []),
    ];
    const isAutoGranted = feature.level != null && !feature.aptitude;
    const family = lockedType ? FAVORED_ENEMY_FAMILY : detectClassFeatFamily(name);
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
      ...(family ? { properties: [{ type: FEAT_FAMILY, value: family }] } : {}),
    });
  }

  feats.push(...spellcastingAdvanceFeats(ref, classSlug));
  return feats;
}
