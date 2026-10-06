/**
 * A class reference's seeds: its class's parts (aptitude picks, modifiers, spell lists) and its FeatSeed[] (its
 * features, its domain picks).
 */

import { bookDomainSeeds } from "@/database/packages/dnd35-from-parser/tools/buildSeeds/domains.ts";
import { existingFeatNamed } from "@/database/packages/dnd35-from-parser/tools/buildSeeds/existingFeats.ts";
import { classReferences } from "@/database/packages/dnd35-from-parser/tools/references.ts";
import {
  autoCompanionGrantModifiers,
  autoUncannyDodgeModifiers,
  extractGrantedFeatNames,
  matchesWithPluralVariants,
  normalizeDescription,
  pluralVariants,
  stripClassSuffix,
  stripSeparators,
} from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import {
  type AptitudePick,
  type BonusFeatList,
  type ClassReference,
  type InheritedSpellList,
  type SpellReference,
} from "@/database/packages/dnd35-from-parser/tools/types.ts";
import { feat, gte } from "@/database/packages/dnd35/content/requirements.ts";
import { type FeatSeed, type ModifierSeed, type RequirementEntry } from "@/database/packages/dnd35/content/types.ts";
import { FAVORED_ENEMY_FAMILY } from "@/database/packages/dnd35/data/feats/favoredEnemy.ts";
import { CLASS_FEATURE_FAMILIES } from "@/shared/dnd3.5/feats.ts";
import { FEAT_FAMILY } from "@/shared/dnd3.5/properties/index.ts";

type PerLevelExpansion = { newTarget: string; levels: number[]; ordinal: string };

const CLASS_FEAT_FAMILIES: { pattern: RegExp; family: string }[] = [
  { pattern: /^(?:Turn or Rebuke Undead|Turn Undead|Rebuke Undead)\b/i, family: "Turn or Rebuke Undead" },
  { pattern: /^Wild Shape\b/i, family: "Wild Shape" },
  // "Grace (Duelist)", not "Grace of the Dark"; "Rage (Barbarian)", not "Rage +1 Use/day"
  ...CLASS_FEATURE_FAMILIES.map((family) => ({ pattern: new RegExp(`^${RegExp.escape(family)} \\(`), family })),
];

/** The families of class features, Favored Enemy's included, which a prerequisite checks by the family's name. */
export const CLASS_FEAT_FAMILY_NAMES = [...CLASS_FEAT_FAMILIES.map(({ family }) => family), FAVORED_ENEMY_FAMILY];

/**
 * Build maps for aptitude target remapping after per-level expansion.
 * - remap: 1-to-1 remaps (single-occurrence features like Ranger combat style tiers)
 * - perLevel: 1-to-N splits (multi-occurrence features like Monk Bonus Feat)
 */
function buildAptitudeExpansionMaps(
  preMerged: AptitudePick[] | undefined,
  expanded: AptitudePick[] | undefined,
): { remap: Map<string, string>; perLevel: Map<string, PerLevelExpansion[]> } {
  const remap = new Map<string, string>();
  const perLevel = new Map<string, PerLevelExpansion[]>();
  if (!preMerged || !expanded) return { remap, perLevel };

  const expandedTargets = new Set(expanded.map((p) => p.target));
  for (const old of preMerged) {
    if (expandedTargets.has(old.target)) continue;
    const replacements = expanded.filter((p) => p.levels.some((l) => old.levels.includes(l)));
    if (replacements.length === 0) continue;
    if (replacements.length === 1) {
      remap.set(old.target, replacements[0].target);
    } else {
      const oldSlug = old.target.match(/^aptitudes\.(.+)\.allowed$/)?.[1] ?? "";
      const entries = replacements.map((r) => {
        const newSlug = r.target.match(/^aptitudes\.(.+)\.allowed$/)?.[1] ?? "";
        const ordinal = newSlug.slice(oldSlug.length);
        return { newTarget: r.target, levels: r.levels, ordinal };
      });
      perLevel.set(old.target, entries);
    }
  }
  return { remap, perLevel };
}

/** A table cell's number: "+10 ft." is 10, "−2" (a typographic minus) is -2, a dash none. */
function cellNumber(cell: string) {
  return Number(cell.replace("\u2212", "-").match(/[+-]?\d+/)?.[0] ?? 0);
}

function detectClassFeatFamily(name: string): string | undefined {
  for (const { pattern, family } of CLASS_FEAT_FAMILIES) {
    if (pattern.test(name)) return family;
  }
  return undefined;
}

/** When bonusFeatLists has per-level entries, expand the single aptitude pick into per-level picks. */
function expandPerLevelAptitudePicks(
  picks?: AptitudePick[],
  bonusFeatLists?: BonusFeatList[],
): AptitudePick[] | undefined {
  if (!picks || !bonusFeatLists) return picks;
  const perLevelLists = bonusFeatLists.filter((l) => l.levels);
  if (perLevelLists.length === 0) return picks;

  // Build a set of levels covered by per-level lists
  const perLevelCoveredLevels = new Set(perLevelLists.flatMap((l) => l.levels!));

  const result: AptitudePick[] = [];
  for (const pick of picks) {
    // Check if this pick's levels overlap with per-level bonusFeatLists
    const overlapping = pick.levels.filter((l) => perLevelCoveredLevels.has(l));
    if (overlapping.length === 0) {
      result.push(pick);
      continue;
    }

    // Replace with per-level picks for covered levels
    for (const list of perLevelLists) {
      if (!list.levels!.some((l) => overlapping.includes(l))) continue;
      const aptSlug = stripSeparators(list.aptitude);
      result.push({ levels: list.levels!, target: `aptitudes.${aptSlug}.allowed` });
    }
    // Keep any remaining levels that aren't covered by per-level lists
    const remaining = pick.levels.filter((l) => !perLevelCoveredLevels.has(l));
    if (remaining.length > 0) {
      result.push({ levels: remaining, target: pick.target });
    }
  }

  return result;
}

/** Merge detected aptitude picks with overrides. Overrides win per-target; detected picks not in overrides are preserved. */
function mergeAptitudePicks(detected?: AptitudePick[], overrides?: AptitudePick[]): AptitudePick[] | undefined {
  if (!overrides) return detected;
  if (!detected) return overrides;
  const overrideTargets = new Set(overrides.map((p) => p.target));
  return [...detected.filter((p) => !overrideTargets.has(p.target)), ...overrides];
}

/**
 * A class's own feats: its class features (other than the existing feats it grants), one per level for a feature
 * that gives a pick at several (its first, second… pick), and the feat advancing its spellcasting.
 */
export function buildClassFeatSeeds(ref: ClassReference): FeatSeed[] {
  const { mapping, detected } = ref;
  const classSlug = stripSeparators(ref.raw.name);
  const { aptitudeMinLevel, remap: aptitudeTargetRemap, perLevel: perLevelExpansion } = classAptitudePicks(ref);
  const levelRequirement = (level: number): RequirementEntry[] => [gte(`classes.${classSlug}.level`, level)];

  // A feature granting a locked favored enemy ("Favored Enemy (Giant)") gets the shared variant through a modifier.
  const lockedFavoredEnemies = new Map<string, string>();
  for (const { featureName, creatureType } of detected.lockedFavoredEnemies ?? []) {
    const key = mapping.occurrenceMap?.[featureName];
    if (key) lockedFavoredEnemies.set(key.toLowerCase(), creatureType);
    lockedFavoredEnemies.set(featureName.toLowerCase(), creatureType);
  }

  const feats: FeatSeed[] = [];
  for (const [key, feature] of Object.entries(mapping.features)) {
    if (feature.skip) continue;
    const name = feature.seedName ?? (feature.aptitude ? `${key} (${feature.aptitude})` : key);
    const lockedType = lockedFavoredEnemies.get(key.toLowerCase());
    // An existing feat the class grants is a free feat, not one of its own.
    if (!lockedType && existingFeatGranted(ref, name, feature.description)) continue;

    const description = normalizeDescription(feature.description ?? "");
    const aptitudes = [feature.aptitude ?? mapping.classFeatureAptitude];
    const perLevelModifier = feature.modifiers?.find((m) => perLevelExpansion.has(m.target));
    if (perLevelModifier) {
      for (const expansion of perLevelExpansion.get(perLevelModifier.target) ?? []) {
        const minLevel = Math.min(...expansion.levels);
        feats.push({
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
        });
      }
      continue;
    }

    const modifiers: ModifierSeed[] = [
      ...(feature.modifiers ?? []).map((m) => ({ ...m, target: aptitudeTargetRemap.get(m.target) ?? m.target })),
      ...autoCompanionGrantModifiers(name, feature.description ?? ""),
      ...autoUncannyDodgeModifiers(name),
      ...(lockedType
        ? [{ target: feat(`Favored Enemy: ${lockedType}`), operator: "set", value: "true", valueType: "boolean" }]
        : []),
    ];
    // A pick in a pool of the class's own (not its class features) opens at the pool's first pick.
    const poolLevel =
      feature.aptitude && feature.aptitude !== mapping.classFeatureAptitude
        ? aptitudeMinLevel.get(stripSeparators(feature.aptitude))
        : undefined;
    const requirements = [
      ...(feature.requirements ?? []),
      ...(poolLevel != null && poolLevel > 1 ? levelRequirement(poolLevel) : []),
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

  // A spellcasting class's own list gets a feat other classes advance it with.
  const casterType = ref.overrides?.casterType ?? detected.casterType;
  if (detected.hasOwnSpells && casterType && !detected.casterLevelAdvancement) {
    feats.push({
      name: `Advance ${ref.raw.name} Spellcasting`,
      description: `Your effective ${classSlug} caster level increases by 1, granting additional spell slots and spells per day as if you had gained a level in ${classSlug}.`,
      stackable: true,
      aptitudes: [
        casterType === "Divine" ? "Bonus Divine Caster Level" : "Bonus Arcane Caster Level",
        "Bonus Caster Level",
      ],
      modifiers: [
        { target: `classes.${classSlug}.bonuscasterlevel`, operator: "add", value: "1", valueType: "number" },
      ],
      requirements: levelRequirement(1),
    });
  }
  return feats;
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
    const parentEntry = Object.entries(mf).find(([key]) => matchesWithPluralVariants(key, s));
    if (!parentEntry) continue;
    const seedName = parentEntry[1].seedName ?? `${parentEntry[0]} (${className})`;
    // Map all variants to this seedName
    for (const variant of pluralVariants(s)) {
      nameMap.set(variant, seedName);
    }
  }
  return nameMap;
}

/**
 * A class's aptitude picks: detected, with the overrides', then split per level where a bonus feat list has one per
 * level (`aptitudePicks`); the first level each aptitude gets a pick (`aptitudeMinLevel`, by slug); and how the split
 * retargets the merged picks (`remap` one to one, `perLevel` one to several).
 */
export function classAptitudePicks(ref: ClassReference) {
  const { overrides } = ref;
  const mergedPicks = mergeAptitudePicks(ref.detected.aptitudePicks, overrides?.aptitudePicks);
  const aptitudePicks = expandPerLevelAptitudePicks(
    mergedPicks,
    overrides?.bonusFeatLists ?? ref.detected.bonusFeatLists,
  );
  const aptitudeMinLevel = new Map<string, number>();
  for (const pick of aptitudePicks ?? []) {
    const slug = pick.target.match(/^aptitudes\.(.+)\.allowed$/)?.[1];
    if (slug) aptitudeMinLevel.set(slug, Math.min(...pick.levels));
  }
  return { aptitudePicks, aptitudeMinLevel, ...buildAptitudeExpansionMaps(mergedPicks, aptitudePicks) };
}

/**
 * The feats a class's domain pool offers (`spells.domainPool`, a divine crusader's): one per domain her book and the
 * core rules have, each joining that domain's list to hers. The domain gives her its spells, not its granted power.
 */
export function classDomainPickFeats(ref: ClassReference): FeatSeed[] {
  const pool = classSpells(ref)?.domainPool;
  if (!pool) return [];
  const book = ref._meta.book;
  const domains = [...bookDomainSeeds("srd").seeds, ...(book === "srd" ? [] : bookDomainSeeds(book).seeds)];
  return domains
    .map(({ name }) => ({
      name: `${name} Domain (${ref.raw.name})`,
      description: `The ${name} domain's spells, one at each spell level, are her spell list. She doesn't gain the domain's granted power.`,
      selectable: true,
      aptitudes: [pool],
      modifiers: [
        {
          target: `aptitudes.${stripSeparators(name)}domainspells.joinsclasslist`,
          operator: "set",
          value: "true",
          valueType: "boolean",
        },
      ],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A class's level modifiers: its overrides', then those its table's columns give (`overrides.columns`), at each level a
 * column's value changes: a number's rise, or its text.
 */
export function classModifiers(ref: ClassReference): (ModifierSeed & { level: number })[] {
  const fromColumns = Object.entries(ref.overrides?.columns ?? {}).flatMap(
    ([column, { target, operator, requirements }]) => {
      if (!ref.raw.progression.some((row) => row.columns?.[column] !== undefined)) {
        throw new Error(`${ref.raw.name}: its table has no "${column}" column`);
      }
      let previous = operator === "add" ? "+0" : "";
      return ref.raw.progression.flatMap((row) => {
        // A blank cell keeps the value above it
        const cell = row.columns?.[column] || previous;
        const rise = cellNumber(cell) - cellNumber(previous);
        const changed = operator === "add" ? rise !== 0 : cell !== previous;
        previous = cell;
        if (!changed) return [];
        const value = operator === "add" ? String(rise) : cell;
        const valueType = operator === "add" ? "number" : "string";
        return [{ level: row.level, target, value, valueType, operator, ...(requirements && { requirements }) }];
      });
    },
  );
  return [...(ref.overrides?.modifiers ?? []), ...fromColumns];
}

/** The spell lists a class's slots go to (`spells.lists`), or its own, "<Class> Spells": none for a class without slots. */
export function classSpellLists(ref: ClassReference): string[] {
  const spells = classSpells(ref);
  if (!spells) return [];
  return spells.lists?.map((list) => list.name) ?? [`${ref.raw.name} Spells`];
}

/** A class's spell slots: detected, with the overrides' fields over them. None when it has none (`noSpells` removes them). */
export function classSpells(ref: ClassReference) {
  const { spells } = ref.mapping;
  return spells && ref.overrides?.spells ? { ...spells, ...ref.overrides.spells } : spells;
}

/**
 * The existing feat a class's feature named `name` grants instead of being a feat of its own: that feat (with or without
 * the class's suffix), or one its description says it gains as a bonus feat.
 */
export function existingFeatGranted(ref: ClassReference, name: string, description: string | undefined) {
  const book = ref._meta.book;
  const baseName = stripClassSuffix(name, ref.raw.name);
  return (
    (baseName && existingFeatNamed(book, baseName)) ||
    existingFeatNamed(book, name) ||
    (description
      ? extractGrantedFeatNames(description)
          .map((n) => existingFeatNamed(book, n))
          .find(Boolean)
      : undefined)
  );
}

/**
 * A spell's level on a list a class draws on (`inheritsFrom`): on the first of its classes' lists that has it, when
 * it's of the list's schools and has none of its excluded descriptors.
 */
export function inheritedLevel(
  spell: Pick<SpellReference["raw"][number], "school" | "descriptors">,
  levelEntries: { className: string; level: number }[],
  list: InheritedSpellList,
): number | undefined {
  if (list.schools && !list.schools.includes(spell.school)) return undefined;
  if (spell.descriptors.some((descriptor) => list.excludeDescriptors?.includes(descriptor))) return undefined;
  for (const className of list.classes) {
    const entry = levelEntries.find((le) => le.className === className);
    if (entry) return entry.level;
  }
  return undefined;
}

/** The lists a book's classes draw on others' lists for (`inheritsFrom`): each class's own, or each of its `lists`. */
export function inheritedLists(book: string): { aptitude: string; list: InheritedSpellList }[] {
  const lists: { aptitude: string; list: InheritedSpellList }[] = [];
  for (const { ref } of classReferences(book)) {
    const spells = classSpells(ref);
    if (!spells || !ref.raw?.name || ref.overrides?.skip) continue;
    if (spells.inheritsFrom) lists.push({ aptitude: `${ref.raw.name} Spells`, list: spells.inheritsFrom });
    for (const list of spells.lists ?? []) lists.push({ aptitude: list.name, list: list.inheritsFrom });
  }
  return lists;
}

/** Insert an ordinal suffix before the parenthetical class suffix in a feat name. */
export function insertOrdinalInName(name: string, ordinal: string): string {
  const match = name.match(/^(.+?)(\s*\(.+\))$/);
  if (match) return `${match[1]} ${ordinal}${match[2]}`;
  return `${name} ${ordinal}`;
}
