/**
 * Shared module: builds ClassSeed / FeatSeed objects from reference JSON.
 *
 * Used by the generator to produce .ts seed files and collect aptitudes.
 * This is the single source of truth for "reference JSON → seed object" conversion.
 */

import type { ClassSeed } from "@/database/packages/dnd35/seed-utils/types.ts";
import type { FeatSeed, RequirementEntry, ModifierSeed } from "@/database/packages/dnd35/v1/feats/types.ts";
import type { PowerSeed } from "@/database/packages/dnd35/v1/spells/types.ts";
import type { DomainDefinition } from "@/database/packages/dnd35/v1/domains/types.ts";
import type { WizardSchoolDefinition } from "@/database/packages/dnd35/v1/wizard-schools/types.ts";
import type { RaceDefinition } from "@/database/packages/dnd35/v1/races/types.ts";
import type { ItemDef } from "@/database/packages/dnd35/v1/items/types.ts";
import type { ClassReference, DomainReference, FeatReference, ItemReference, MagicItemReference, RaceReference, SpellReference, WizardSchoolReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";
import { ALL_WEAPONS, SIMPLE_WEAPONS, MARTIAL_WEAPONS, EXOTIC_WEAPONS } from "@/database/packages/dnd35/v1/feats/weapons.ts";
import { SKILL_NAMES } from "@/database/packages/dnd35/v1/feats/skills.ts";
import {
  FAVORED_ENEMY_APTITUDE,
  FAVORED_ENEMY_FAMILY,
  favoredEnemy as FAVORED_ENEMY_VARIANTS,
  favoredEnemySpecializationVariants as FAVORED_ENEMY_SPECIALIZATION_VARIANTS,
} from "@/database/packages/dnd35/v1/feats/creatureTypes.ts";
import { MAGIC_SCHOOLS } from "@/shared/dnd3.5/spells.ts";
import { WIZARD_SCHOOLS } from "@/database/packages/dnd35/v1/wizard-schools/data.ts";
import { detectBaseItem } from "@/database/packages/dnd35-from-parser/tools/scraper/detectMagicItem.ts";
import { sanitizeText } from "@/database/packages/dnd35-from-parser/tools/sanitize.ts";
import { stripSeparators, stripClassSuffix, mergedFeatures, normalizeDescription, expandTemplateDescription, extractGrantedFeatNames, SIMPLE_SET, MARTIAL_SET, MAX_DESC, matchesWithPluralVariants, pluralVariants } from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Existing feat lookup — set of known feat names
// Used to detect when a class feature duplicates an existing feat
// ---------------------------------------------------------------------------

const _existingFeatsCache = new Map<string, Set<string>>();

export function loadExistingFeats(book?: string): Set<string> {
  const key = book ?? "__srd__";
  if (_existingFeatsCache.has(key)) return _existingFeatsCache.get(key)!;

  const feats = new Set<string>();
  const refDir = join(import.meta.dirname!, "../reference");

  // Load feat names from SRD (parent) and the current book's reference JSON.
  // Skip template feats (family parents like "Weapon Specialization") — they
  // expand into per-variant feats during generation and the bare name is never
  // seeded, so matching against it would create phantom freeFeat lookups.
  const books = book ? [book, "srd"] : ["srd"];
  for (const b of books) {
    const featsPath = join(refDir, b, "feats.json");
    if (!existsSync(featsPath)) continue;
    const ref: FeatReference = JSON.parse(readFileSync(featsPath, "utf-8"));
    for (const feat of ref.raw) {
      const mapped = ref.mapping[feat.name];
      if (mapped?.template) continue;
      feats.add(feat.name);
    }
  }

  _existingFeatsCache.set(key, feats);
  return feats;
}

type AptitudePick = { levels: number[]; target: string };

/** Merge detected aptitude picks with overrides. Overrides win per-target; detected picks not in overrides are preserved. */
export function mergeAptitudePicks(detected?: AptitudePick[], overrides?: AptitudePick[]): AptitudePick[] | undefined {
  if (!overrides) return detected;
  if (!detected) return overrides;
  const overrideTargets = new Set(overrides.map((p) => p.target));
  return [...detected.filter((p) => !overrideTargets.has(p.target)), ...overrides];
}

/** When bonusFeatLists has per-level entries, expand the single aptitude pick into per-level picks. */
export function expandPerLevelAptitudePicks(
  picks?: AptitudePick[],
  bonusFeatLists?: { aptitude: string; feats: string[]; levels?: number[] }[],
  _className?: string,
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
      if (!list.levels!.some(l => overlapping.includes(l))) continue;
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

export type PerLevelExpansion = { newTarget: string; levels: number[]; ordinal: string };

/**
 * Build maps for aptitude target remapping after per-level expansion.
 * - remap: 1-to-1 remaps (single-occurrence features like Ranger combat style tiers)
 * - perLevel: 1-to-N splits (multi-occurrence features like Monk Bonus Feat)
 */
export function buildAptitudeExpansionMaps(
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

/** Insert an ordinal suffix before the parenthetical class suffix in a feat name. */
export function insertOrdinalInName(name: string, ordinal: string): string {
  const match = name.match(/^(.+?)(\s*\(.+\))$/);
  if (match) return `${match[1]} ${ordinal}${match[2]}`;
  return `${name} ${ordinal}`;
}

// ---------------------------------------------------------------------------
// Class reference → ClassSeed + FeatSeed[]
// ---------------------------------------------------------------------------

export function buildClassSeeds(ref: ClassReference): { class: ClassSeed; feats: FeatSeed[] } {
  return {
    class: buildClassSeed(ref),
    feats: buildClassFeats(ref),
  };
}

export { stripClassSuffix, mergedFeatures, normalizeDescription };

/** Build a set of pool parent keys (lowercase) so the generator can skip them
 *  (pool parents are container entries, not actual feats). */
export function buildPoolParentKeys(mf: ClassReference["mapping"]["features"], className: string, classFeatureAptitude: string): Set<string> {
  const keys = new Set<string>();
  const seen = new Set<string>();
  for (const feat of Object.values(mf)) {
    if (!feat.aptitude || feat.aptitude === classFeatureAptitude) continue;
    if (seen.has(feat.aptitude)) continue;
    seen.add(feat.aptitude);
    const suffix = feat.aptitude.replace(new RegExp(`^${className}\\s+`, "i"), "");
    const s = suffix.toLowerCase();
    const parentEntry = Object.entries(mf).find(([key]) => matchesWithPluralVariants(key, s));
    if (parentEntry) keys.add(parentEntry[0].toLowerCase());
  }
  return keys;
}

/** Build a map from pool parent variant names (lowercase) → mapping seedName.
 *  Used to resolve occurrences like "Special Ability" to "Special Abilities (Rogue)". */
export function buildPoolParentNameMap(mf: ClassReference["mapping"]["features"], className: string, classFeatureAptitude: string): Map<string, string> {
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

function buildClassSeed(ref: ClassReference): ClassSeed {
  const d = ref.detected;
  const m = ref.mapping;
  const o = m.overrides ?? {};

  const reqs = o.requirements ?? d.requirements;

  const seed: ClassSeed = {
    name: ref.raw.name,
    description: normalizeDescription(o.description ?? ref.raw.description, MAX_DESC),
    hd: d.hd,
    levels: d.levels,
    skillPoints: d.skillPoints,
    bab: o.bab ?? d.bab,
    saves: o.saves ?? d.saves,
    classSkills: o.classSkills ?? ref.raw.classSkills,
    ...(reqs.length > 0 ? { requirements: reqs } : {}),
    ...(d.casterLevelAdvancement ? { casterLevelAdvancement: d.casterLevelAdvancement } : {}),
    ...(m.classFeatureAptitude ? { classFeatureAptitude: m.classFeatureAptitude } : {}),
    ...(o.proficiencies?.length ? { proficiencies: o.proficiencies } : {}),
    ...(o.freeFeats?.length ? { freeFeats: o.freeFeats } : {}),
    ...((o.bonusSpellAbility ?? m.bonusSpellAbility) ? { bonusSpellAbility: o.bonusSpellAbility ?? m.bonusSpellAbility } : {}),
    ...((o.casterType ?? d.casterType) ? { casterType: o.casterType ?? d.casterType } : {}),
    ...(m.spells ? { spells: o.spells ? { ...m.spells, ...(o.spells.known ? { known: o.spells.known, knowAll: undefined } : {}), ...(o.spells.knowAll === false ? { knowAll: undefined } : o.spells.knowAll ? { knowAll: o.spells.knowAll } : {}) } : m.spells } : {}),
    ...(o.modifiers?.length ? { modifiers: o.modifiers } : {}),
    ...(() => {
      const preMerged = mergeAptitudePicks(d.aptitudePicks, o.aptitudePicks);
      const merged = expandPerLevelAptitudePicks(preMerged, o.bonusFeatLists ?? d.bonusFeatLists, ref.raw.name) ?? [];
      // Auto-generate aptitude picks from casterLevelAdvancement
      const cla = d.casterLevelAdvancement;
      if (cla) {
        if (cla.type === "dual") {
          merged.push({ levels: cla.levels, target: "aptitudes.bonusarcanecasterlevel.allowed" });
          merged.push({ levels: cla.levels, target: "aptitudes.bonusdivinecasterlevel.allowed" });
        } else if (cla.type === "arcane") {
          merged.push({ levels: cla.levels, target: "aptitudes.bonusarcanecasterlevel.allowed" });
        } else if (cla.type === "divine") {
          merged.push({ levels: cla.levels, target: "aptitudes.bonusdivinecasterlevel.allowed" });
        } else {
          merged.push({ levels: cla.levels, target: "aptitudes.bonuscasterlevel.allowed" });
        }
      }
      const { remap, perLevel } = buildAptitudeExpansionMaps(preMerged, merged);
      // Strip aptitude picks that are already handled by feat modifiers on class features.
      // The feat owns the modifier (class level grants feat → feat adds the pick).
      const mf_ = mergedFeatures(ref);
      const featModTargets = new Set<string>();
      for (const feat of Object.values(mf_)) {
        if (feat.modifiers) {
          for (const mod of feat.modifiers) {
            if (mod.operator === "add" && mod.target.startsWith("aptitudes.") && mod.target.endsWith(".allowed")) {
              const remapped = remap.get(mod.target);
              if (remapped) {
                featModTargets.add(remapped);
              } else {
                const expansions = perLevel.get(mod.target);
                if (expansions) {
                  for (const exp of expansions) featModTargets.add(exp.newTarget);
                } else {
                  featModTargets.add(mod.target);
                }
              }
            }
          }
        }
      }
      const filtered = merged.filter((p) => !featModTargets.has(p.target));
      return filtered.length ? { aptitudePicks: filtered } : {};
    })(),
  };

  // Build class features from detected + mapping (with overrides applied)
  // Split into classFeatures vs freeFeats based on existing feat lookup
  const mf = mergedFeatures(ref);
  const poolParentNames = buildPoolParentNameMap(mf, ref.raw.name, m.classFeatureAptitude);
  const existingFeats = loadExistingFeats(ref._meta.book);
  const features: [number, string][] = [];
  const autoFreeFeats: [number, string, string][] = [];

  // Build per-level feat name map for multi-occurrence aptitude expansions
  // e.g. "Bonus Feat" at levels [1,2,6] → level 1 → "Bonus Feat 1st (Monk)", etc.
  const preMergedForNames = mergeAptitudePicks(d.aptitudePicks, o.aptitudePicks);
  const expandedForNames = expandPerLevelAptitudePicks(preMergedForNames, o.bonusFeatLists ?? d.bonusFeatLists, ref.raw.name);
  const { perLevel: perLevelForNames } = buildAptitudeExpansionMaps(preMergedForNames, expandedForNames);
  const perLevelFeatNames = new Map<string, Map<number, string>>();
  for (const [key, feat] of Object.entries(mf)) {
    if (!feat.modifiers) continue;
    for (const mod of feat.modifiers) {
      if (perLevelForNames.has(mod.target)) {
        const baseName = feat.seedName ?? (feat.aptitude ? `${key} (${feat.aptitude})` : key);
        const levelMap = new Map<number, string>();
        for (const exp of perLevelForNames.get(mod.target)!) {
          const name = insertOrdinalInName(baseName, exp.ordinal);
          for (const level of exp.levels) levelMap.set(level, name);
        }
        perLevelFeatNames.set(key.toLowerCase(), levelMap);
      }
    }
  }

  for (const occ of d.featureOccurrences) {
    // Use occurrenceMap for variant→parent resolution, fall back to case-insensitive match
    const mappingKey = m.occurrenceMap?.[occ.name];
    const mapped = mappingKey && mf[mappingKey] ? [mappingKey, mf[mappingKey]] as const
      : Object.entries(mf).find(([key]) => key.toLowerCase() === occ.name.toLowerCase()) as [string, typeof mf[string]] | undefined;
    if (mapped && "skip" in mapped[1] && mapped[1].skip) continue;
    if (occ.name.startsWith("Table:")) continue;
    const name = (mapped ? mapped[1].seedName : undefined) ?? poolParentNames.get(occ.name.toLowerCase()) ?? occ.name;

    // Check if this is an existing feat (with or without class suffix)
    const baseName = stripClassSuffix(name, ref.raw.name);
    let freeFeatName = baseName && existingFeats.has(baseName) ? baseName
      : existingFeats.has(name) ? name
      : undefined;
    // Fallback: parse description for "gains X as a bonus feat" patterns
    if (!freeFeatName && mapped?.[1]?.description) {
      const granted = extractGrantedFeatNames(mapped[1].description);
      freeFeatName = granted.find((n) => existingFeats.has(n));
    }
    if (freeFeatName && m.classFeatureAptitude) {
      for (const level of occ.levels) autoFreeFeats.push([level, freeFeatName, m.classFeatureAptitude]);
    } else {
      // Check for per-level split names
      const resolvedKey = mapped ? mapped[0].toLowerCase() : occ.name.toLowerCase();
      const levelMap = perLevelFeatNames.get(resolvedKey);
      for (const level of occ.levels) {
        features.push([level, levelMap?.get(level) ?? name]);
      }
    }
  }

  // Add mapping features that have a level but no matching occurrence
  // (e.g. "Weapon and Armor Proficiency" — not in progression table, only in class features text)
  const coveredKeys = new Set<string>();
  for (const occ of d.featureOccurrences) {
    const key = m.occurrenceMap?.[occ.name] ?? occ.name;
    coveredKeys.add(key.toLowerCase());
  }
  for (const [key, feat] of Object.entries(mf)) {
    if (feat.skip || feat.level == null || coveredKeys.has(key.toLowerCase())) continue;
    // Skip pool sub-options (they're selectable picks, not auto-granted)
    if (feat.aptitude && feat.aptitude !== m.classFeatureAptitude) continue;
    const name = feat.seedName ?? key;
    const baseName = stripClassSuffix(name, ref.raw.name);
    let freeFeatName = baseName && existingFeats.has(baseName) ? baseName
      : existingFeats.has(name) ? name
      : undefined;
    if (!freeFeatName && feat.description) {
      const granted = extractGrantedFeatNames(feat.description);
      freeFeatName = granted.find((n) => existingFeats.has(n));
    }
    if (freeFeatName && m.classFeatureAptitude) {
      autoFreeFeats.push([feat.level, freeFeatName, m.classFeatureAptitude]);
    } else {
      features.push([feat.level, name]);
    }
  }

  features.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  autoFreeFeats.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  if (features.length > 0) seed.classFeatures = features;

  // Merge auto-detected freeFeats with any from mapping
  const allFreeFeats = [...(o.freeFeats ?? []), ...autoFreeFeats];
  if (allFreeFeats.length > 0) seed.freeFeats = allFreeFeats;

  return seed;
}

const CLASS_FEAT_FAMILIES: { pattern: RegExp; family: string }[] = [
  { pattern: /^(?:Turn or Rebuke Undead|Turn Undead|Rebuke Undead)\b/i, family: "Turn or Rebuke Undead" },
  { pattern: /^Wild Shape\b/i, family: "Wild Shape" },
];

function detectClassFeatFamily(name: string): string | undefined {
  for (const { pattern, family } of CLASS_FEAT_FAMILIES) {
    if (pattern.test(name)) return family;
  }
  return undefined;
}

function buildClassFeats(ref: ClassReference): FeatSeed[] {
  const m = ref.mapping;
  const mf = mergedFeatures(ref);
  const classSlug = stripSeparators(ref.raw.name);
  const existingFeats = loadExistingFeats(ref._meta.book);

  // Build map from aptitude slug → minimum pick level
  const aptitudeMinLevel = new Map<string, number>();
  const mergedPicks = mergeAptitudePicks(ref.detected.aptitudePicks, ref.mapping.overrides?.aptitudePicks);
  const aptitudePicks = expandPerLevelAptitudePicks(mergedPicks, ref.mapping.overrides?.bonusFeatLists ?? ref.detected.bonusFeatLists, ref.raw.name);
  if (aptitudePicks) {
    for (const pick of aptitudePicks) {
      const slugMatch = pick.target.match(/^aptitudes\.(.+)\.allowed$/);
      if (slugMatch) {
        aptitudeMinLevel.set(slugMatch[1], Math.min(...pick.levels));
      }
    }
  }

  // Build expansion maps for aptitude target remapping
  const { remap: aptitudeTargetRemap, perLevel: perLevelExpansion } = buildAptitudeExpansionMaps(mergedPicks, aptitudePicks);

  // Build set of feature occurrence names that have aptitude picks (used for selectable detection)
  const aptitudePickFeatureNames = new Set<string>();
  if (aptitudePicks && ref.detected.featureOccurrences) {
    for (const pick of aptitudePicks) {
      const slugMatch = pick.target.match(/^aptitudes\.(.+)\.allowed$/);
      if (!slugMatch) continue;
      const pickSlug = slugMatch[1].startsWith(classSlug) ? slugMatch[1].slice(classSlug.length) : slugMatch[1];
      // Match back to feature occurrence by slug
      for (const occ of ref.detected.featureOccurrences) {
        const occSlug = stripSeparators(occ.name);
        if (occSlug === pickSlug) aptitudePickFeatureNames.add(occ.name.toLowerCase());
      }
    }
  }

  const feats = Object.entries(mf)
    .filter(([key, feat]) => {
      if (feat.skip || key.startsWith("Table:")) return false;
      // Skip feats that duplicate existing feats (handled as freeFeats)
      const seedName = feat.seedName ?? (feat.aptitude ? `${key} (${feat.aptitude})` : key);
      const baseName = stripClassSuffix(seedName, ref.raw.name);
      if (baseName && existingFeats.has(baseName)) return false;
      return true;
    })
    .flatMap(([key, feat]) => {
      // Check if this feat has modifiers targeting a per-level expanded aptitude (multi-occurrence)
      const perLevelMod = feat.modifiers?.find((m) => perLevelExpansion.has(m.target));
      if (perLevelMod) {
        const expansions = perLevelExpansion.get(perLevelMod.target)!;
        const baseName = feat.seedName ?? (feat.aptitude ? `${key} (${feat.aptitude})` : key);
        return expansions.map((exp): FeatSeed => {
          const name = insertOrdinalInName(baseName, exp.ordinal);
          const minLevel = Math.min(...exp.levels);
          const requirements: RequirementEntry[] = [];
          if (minLevel > 1) {
            requirements.push({
              target: `classes.${classSlug}.level`,
              operator: "greater_than_or_equal",
              value: String(minLevel),
              valueType: "number",
            });
          }
          return {
            name,
            description: normalizeDescription(feat.description ?? ""),
            aptitudes: [feat.aptitude ?? m.classFeatureAptitude],
            selectable: false,
            ...(requirements.length > 0 ? { requirements } : {}),
            ...(feat.modifiers?.length ? { modifiers: (feat.modifiers as ModifierSeed[]).map((mod) => {
              if (mod.target === perLevelMod.target) return { ...mod, target: exp.newTarget };
              return mod;
            }) } : {}),
          };
        });
      }

      const requirements: RequirementEntry[] = [];
      const aptSlug = stripSeparators(feat.aptitude ?? m.classFeatureAptitude);
      const isPoolSubOption = feat.aptitude != null && feat.aptitude !== m.classFeatureAptitude;
      if (isPoolSubOption) {
        // Pool sub-option: require the minimum pick level from aptitudePicks
        const minLevel = aptitudeMinLevel.get(aptSlug);
        if (minLevel != null && minLevel > 1) {
          requirements.push({
            target: `classes.${classSlug}.level`,
            operator: "greater_than_or_equal",
            value: String(minLevel),
            valueType: "number",
          });
        }
      } else if (feat.level != null && feat.level > 1) {
        requirements.push({
          target: `classes.${classSlug}.level`,
          operator: "greater_than_or_equal",
          value: String(feat.level),
          valueType: "number",
        });
      }

      // selectable: false when explicitly set in mapping, or auto-granted (has level + main aptitude)
      // Pool sub-options and aptitude pick targets are selectable
      const isAptitudePickFeature = pluralVariants(key).some(v => aptitudePickFeatureNames.has(v));
      const isAutoGranted = feat.level != null && !isPoolSubOption && !isAptitudePickFeature;
      const notSelectable = feat.selectable === false || isAutoGranted;
      const seedName = feat.seedName ?? (feat.aptitude ? `${key} (${feat.aptitude})` : key);
      const featFamily = detectClassFeatFamily(seedName);
      const seed: FeatSeed = {
        name: seedName,
        description: normalizeDescription(feat.description ?? ""),
        aptitudes: [feat.aptitude ?? m.classFeatureAptitude],
        ...(feat.stackable ? { stackable: true } : {}),
        ...(notSelectable ? { selectable: false } : {}),
        ...(requirements.length > 0 ? { requirements } : {}),
        ...(feat.modifiers?.length ? { modifiers: (feat.modifiers as ModifierSeed[]).map((mod) => {
          const newTarget = aptitudeTargetRemap.get(mod.target);
          return newTarget ? { ...mod, target: newTarget } : mod;
        }) } : {}),
        ...(featFamily ? { properties: [{ type: "FEAT_FAMILY", value: featFamily }] } : {}),
      };
      return [seed];
    });

  // Append advancement feat for qualifying spellcasting classes
  const casterType = m.overrides?.casterType ?? ref.detected.casterType;
  if (ref.detected.hasOwnSpells && casterType && !ref.detected.casterLevelAdvancement) {
    const DIVINE = "Bonus Divine Caster Level";
    const ARCANE = "Bonus Arcane Caster Level";
    const ALL = "Bonus Caster Level";
    feats.push({
      name: `Advance ${ref.raw.name} Spellcasting`,
      description: `Your effective ${classSlug} caster level increases by 1, granting additional spell slots and spells per day as if you had gained a level in ${classSlug}.`,
      stackable: true,
      aptitudes: [casterType === "Divine" ? DIVINE : ARCANE, ALL],
      modifiers: [{ target: `classes.${classSlug}.bonuscasterlevel`, operator: "add", value: "1", valueType: "number" }],
      requirements: [{ target: `classes.${classSlug}.level`, operator: "greater_than_or_equal", value: "1", valueType: "number" }],
    });
  }

  return feats;
}

// ---------------------------------------------------------------------------
// Domain reference → DomainDefinition[]
// ---------------------------------------------------------------------------

/**
 * Build a slug→name lookup from the spells reference.
 * Domain spell links use href anchors (e.g. "#obscuring-mist") that match
 * the spell page's <a id="obscuring-mist"> — so we can resolve canonical names.
 */
export function buildSpellSlugMap(spellRef: SpellReference): Map<string, string> {
  const map = new Map<string, string>();
  for (const spell of spellRef.raw) {
    map.set(spell.slug, spell.name);
  }
  return map;
}

export function buildDomainSeeds(ref: DomainReference, spellSlugMap?: Map<string, string>): DomainDefinition[] {
  return ref.raw.map((entry) => {
    const mapping = ref.mapping?.[entry.name];
    const override = ref.mapping?.overrides?.[entry.name];
    const spellSource = override?.spells ?? entry.spells;

    return {
      name: override?.name ?? entry.name,
      description: mapping?.description ?? entry.description,
      ...(mapping?.modifiers?.length ? { modifiers: mapping.modifiers } : {}),
      spells: spellSource.map((s) => {
        // Resolve canonical name from slug if available
        const slug = "slug" in s ? (s as { slug?: string }).slug : undefined;
        const resolved = slug && spellSlugMap ? spellSlugMap.get(slug) : undefined;
        return { name: resolved ?? s.name, level: s.level };
      }).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
    };
  });
}

// ---------------------------------------------------------------------------
// Domain feat pool → FeatSeed[] (e.g. War Domain Weapon feats)
// ---------------------------------------------------------------------------

function resolveFeatPoolItems(items: "martial" | "simple" | "exotic" | "all" | string[]): string[] {
  if (Array.isArray(items)) return items;
  switch (items) {
    case "martial": return MARTIAL_WEAPONS;
    case "simple": return SIMPLE_WEAPONS;
    case "exotic": return EXOTIC_WEAPONS;
    case "all": return ALL_WEAPONS;
  }
}

export function buildDomainFeatPoolSeeds(ref: DomainReference): FeatSeed[] {
  const results: FeatSeed[] = [];

  for (const entry of ref.raw) {
    const mapping = ref.mapping?.[entry.name];
    const pool = mapping?.featPool;
    if (!pool) continue;

    const items = resolveFeatPoolItems(pool.items);

    for (const item of items) {
      const itemSlug = stripSeparators(item);

      const modifiers: ModifierSeed[] = pool.grants.map((family) => ({
        target: `feats.${stripSeparators(family)}${itemSlug}.possessed`,
        operator: "set",
        value: "true",
        valueType: "boolean",
      }));

      const properties = pool.grants.map((family) => ({
        type: "FEAT_FAMILY",
        value: family,
      }));

      const description = pool.description
        ? pool.description.replace(/\$\{w\}/g, item)
        : `Granted by the ${entry.name} domain.`;

      results.push({
        name: `${pool.namePrefix}: ${item}`,
        description,
        aptitudes: [pool.aptitude],
        modifiers,
        properties,
      });
    }
  }

  return results;
}

export { FAVORED_ENEMY_APTITUDE, FAVORED_ENEMY_FAMILY };

export function buildFavoredEnemyFeats(): FeatSeed[] {
  return [...FAVORED_ENEMY_VARIANTS, ...FAVORED_ENEMY_SPECIALIZATION_VARIANTS];
}

// ---------------------------------------------------------------------------
// Wizard school reference → WizardSchoolDefinition[]
// ---------------------------------------------------------------------------

export function buildWizardSchoolSeeds(ref: WizardSchoolReference): WizardSchoolDefinition[] {
  return ref.raw.map((entry) => ({
    name: entry.name,
    description: ref.mapping?.overrides?.[entry.name]?.description ?? entry.description,
    prohibitedSchoolCount: entry.prohibitedSchoolCount,
  }));
}

// ---------------------------------------------------------------------------
// Race reference → RaceDefinition[]
// ---------------------------------------------------------------------------

export function buildRaceSeeds(ref: RaceReference): RaceDefinition[] {
  return ref.raw.map((entry) => {
    const mapping = ref.mapping?.[entry.name];
    const ovr = ref.mapping?.overrides?.[entry.name];

    return {
      name: ovr?.name ?? entry.name,
      description: mapping?.description ?? entry.description,
      size: (ovr?.size ?? entry.size) as RaceDefinition["size"],
      baseSpeed: ovr?.baseSpeed ?? entry.baseSpeed,
      ...(mapping?.modifiers?.length ? { modifiers: mapping.modifiers } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// Feat reference → FeatSeed[]
// ---------------------------------------------------------------------------

/** Build map of feat name → additional aptitudes from all class bonusFeatLists in a given book. */
export function loadBonusFeatAptitudes(book: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const classDir = join(import.meta.dirname!, "../reference", book, "classes");
  if (!existsSync(classDir)) return map;

  function add(featName: string, aptitude: string) {
    const existing = map.get(featName) ?? [];
    if (!existing.includes(aptitude)) {
      existing.push(aptitude);
      map.set(featName, existing);
    }
  }

  for (const file of readdirSync(classDir).filter((f) => f.endsWith(".json"))) {
    const ref = JSON.parse(readFileSync(join(classDir, file), "utf-8")) as ClassReference;

    // Bonus feat lists → aptitudes
    const lists = ref.detected?.bonusFeatLists;
    if (lists) {
      for (const list of lists) {
        for (const featName of list.feats) {
          add(featName, list.aptitude);
        }
      }
    }

    // "gains X as a bonus feat" in class feature descriptions → class feature aptitude
    const aptitude = ref.mapping?.classFeatureAptitude;
    if (!aptitude) continue;
    const grantRegex = /gains (?:the )?([A-Z][^.]*?) (?:feat [^.]*)?as a bonus feat/g;
    for (const cf of ref.raw.classFeatures) {
      let match: RegExpExecArray | null;
      while ((match = grantRegex.exec(cf.description)) !== null) {
        const name = match[1].replace(/\s*\([^)]*\)\s*$/, "").trim();
        add(name, aptitude);
      }
    }
  }
  return map;
}

/** Build map of feat name → class levels that grant it as a bonus feat (for alternate prereqs). */
export function loadBonusFeatClassLevels(book: string): Map<string, { classSlug: string; minLevel: number }[]> {
  const map = new Map<string, { classSlug: string; minLevel: number }[]>();
  const classDir = join(import.meta.dirname!, "../reference", book, "classes");
  if (!existsSync(classDir)) return map;

  for (const file of readdirSync(classDir).filter((f) => f.endsWith(".json"))) {
    const ref = JSON.parse(readFileSync(join(classDir, file), "utf-8")) as ClassReference;
    const lists = ref.detected?.bonusFeatLists;
    if (!lists) continue;
    const classSlug = file.replace(".json", "");
    for (const list of lists) {
      if (!list.levels?.length) continue;
      const minLevel = Math.min(...list.levels);
      for (const featName of list.feats) {
        const existing = map.get(featName) ?? [];
        existing.push({ classSlug, minLevel });
        map.set(featName, existing);
      }
    }
  }
  return map;
}

export function buildFeatSeeds(ref: FeatReference, book?: string): FeatSeed[] {
  const results: FeatSeed[] = [];

  // Collect all template names for cross-referencing (e.g. Greater Spell Focus → Spell Focus)
  const allTemplateNames = new Set<string>();
  for (const entry of ref.raw) {
    const mapped = ref.mapping[entry.name];
    if (mapped?.template) allTemplateNames.add(entry.name);
  }

  for (const entry of ref.raw) {
    const mapped = ref.mapping[entry.name];
    if (!mapped || mapped.skip) continue;

    if (mapped.template) {
      results.push(...expandTemplateFeat(entry, ref.detected[entry.name], mapped, allTemplateNames));
      continue;
    }

    const seed: FeatSeed = {
      name: entry.name,
      description: normalizeDescription(mapped.description ?? entry.benefit),
      aptitudes: mapped.aptitudes ?? [],
      ...(mapped.stackable ? { stackable: true } : {}),
      ...(mapped.selectable === false ? { selectable: false } : {}),
      ...(mapped.requirements?.length ? { requirements: mapped.requirements } : {}),
      ...(mapped.modifiers?.length ? { modifiers: mapped.modifiers } : {}),
      ...(mapped.properties?.length ? { properties: mapped.properties } : {}),
    };
    results.push(seed);
  }

  // System feats are only generated for the SRD — other books reuse them
  if (book === "srd") {
    results.push(...buildWizardSchoolFeatSeeds());
    results.push(...buildWeaponProficiencyFeatSeeds());
  }
  // Append class feature feats from class seed JSONs
  if (book) {
    results.push(...loadClassFeatureSeeds(book));
  }

  return results;
}

// ---------------------------------------------------------------------------
// System feat builders
// ---------------------------------------------------------------------------

function buildWizardSchoolFeatSeeds(): FeatSeed[] {
  const SPEC = "Wizard Specialization";
  const PROHIB = "Prohibited School";

  return [
    ...WIZARD_SCHOOLS.map((s) => ({
      name: `${s.name} Specialist`,
      description: s.description,
      aptitudes: [SPEC],
      modifiers: [{
        target: "aptitudes.prohibitedschool.allowed",
        operator: "add",
        value: String(s.prohibitedSchoolCount),
        valueType: "number",
      }],
    })),
    {
      name: "Generalist",
      description: "A generalist wizard does not specialize in any school of magic. They have no prohibited schools and gain no bonus spell slots, but can freely learn spells from all schools.",
      aptitudes: [SPEC],
    },
    ...WIZARD_SCHOOLS.map((s) => ({
      name: `Prohibit ${s.name}`,
      description: `You cannot learn, prepare, or cast spells from the school of ${s.name}. All spells from this school are removed from your spell list.`,
      aptitudes: [PROHIB],
      properties: [{ type: "WIZARD_PROHIBITED_SCHOOL", value: s.name }],
    })),
  ];
}

function buildWeaponProficiencyFeatSeeds(): FeatSeed[] {
  return [
    ...SIMPLE_WEAPONS.map(w => ({
      name: `Simple Weapon Proficiency: ${w}`,
      description: `You are proficient with the ${w.toLowerCase()}.`,
      aptitudes: ["General"],
      selectable: false,
    })),
    ...MARTIAL_WEAPONS.map(w => ({
      name: `Martial Weapon Proficiency: ${w}`,
      description: `You are proficient with the ${w.toLowerCase()}.`,
      aptitudes: ["General"],
      selectable: false,
    })),
  ];
}

function loadClassFeatureSeeds(book: string): FeatSeed[] {
  const classDir = join(import.meta.dirname!, "../generated", book, "classes");
  if (!existsSync(classDir)) return [];

  const results: FeatSeed[] = [];
  for (const file of readdirSync(classDir)) {
    if (!file.endsWith(".seed.json")) continue;
    const data = JSON.parse(readFileSync(join(classDir, file), "utf-8"));
    for (const feat of data.feats ?? []) {
      results.push({
        name: feat.name,
        description: normalizeDescription(feat.description ?? ""),
        aptitudes: feat.aptitudes ?? [],
        ...(feat.requirements?.length ? { requirements: feat.requirements } : {}),
        ...(feat.modifiers?.length ? { modifiers: feat.modifiers } : {}),
        ...(feat.properties?.length ? { properties: feat.properties } : {}),
        ...(feat.stackable ? { stackable: true } : {}),
        ...(feat.selectable === false ? { selectable: false } : {}),
      });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Aptitude collection
// ---------------------------------------------------------------------------

export function collectAptitudes(feats: FeatSeed[], book: string): string[] {
  const names = new Set<string>();
  const refBase = join(import.meta.dirname!, "../reference");

  // Collect all feats: standalone feats + class feature feats from reference JSONs
  const allFeats = [...feats];
  const classRefDir = join(refBase, book, "classes");
  if (existsSync(classRefDir)) {
    for (const file of readdirSync(classRefDir).filter((f) => f.endsWith(".json"))) {
      const ref: ClassReference = JSON.parse(readFileSync(join(classRefDir, file), "utf-8"));
      const seeds = buildClassSeeds(ref);
      if (seeds.feats) allFeats.push(...seeds.feats);

      const cls = seeds.class;
      if (cls?.classFeatureAptitude) names.add(cls.classFeatureAptitude);
      for (const pick of cls?.aptitudePicks ?? []) {
        const slug = pick.target.match(/^aptitudes\.(.+)\.allowed$/)?.[1];
        if (slug) {
          const match = [...names].find((n) => stripSeparators(n) === slug);
          if (!match) {
            for (const feat of allFeats) {
              for (const apt of feat.aptitudes) {
                if (stripSeparators(apt) === slug) { names.add(apt); break; }
              }
            }
          }
        }
      }
      if (cls?.spells) names.add(`${cls.name} Spells`);

      // From detected bonusFeatLists
      if (ref.detected?.bonusFeatLists) {
        for (const list of ref.detected.bonusFeatLists) names.add(list.aptitude);
      }
    }
  }

  // From feat aptitudes
  for (const feat of allFeats) {
    for (const apt of feat.aptitudes) names.add(apt);
  }

  // From feat modifier targets referencing aptitudes
  for (const feat of allFeats) {
    for (const mod of feat.modifiers ?? []) {
      const slugMatch = mod.target.match(/^aptitudes\.([^.]+)\./);
      if (!slugMatch) continue;
      const slug = slugMatch[1];
      if ([...names].some((n) => stripSeparators(n) === slug)) continue;
      const featParenMatch = feat.name.match(/^(.+?)\s*\(([^)]+)\)$/);
      if (featParenMatch) {
        const candidate = `${featParenMatch[2]} ${featParenMatch[1]}`;
        if (stripSeparators(candidate) === slug) names.add(candidate);
        else if (stripSeparators(featParenMatch[1]) === slug) names.add(featParenMatch[1]);
      }
    }
  }

  // Domain aptitudes — check if this book has generated domain data (non-empty)
  const generatedDomainPath = join(import.meta.dirname!, "../generated", book, "domains/data.ts");
  const hasDomains = existsSync(generatedDomainPath) && !readFileSync(generatedDomainPath, "utf-8").includes("ALL_DOMAINS: DomainDefinition[] = [];");
  if (hasDomains) {
    names.add("Cleric Domain");
    // Check if any of this book's domains have feat pools
    const domainFeatsPath = join(import.meta.dirname!, "../generated", book, "feats/domainFeats.ts");
    if (existsSync(domainFeatsPath)) {
      const masterDomainPath = join(refBase, "domains.json");
      if (existsSync(masterDomainPath)) {
        const domainRef: DomainReference = JSON.parse(readFileSync(masterDomainPath, "utf-8"));
        // Read generated domain names to filter
        const generatedContent = readFileSync(generatedDomainPath, "utf-8");
        for (const entry of domainRef.raw) {
          if (!generatedContent.includes(`name: "${entry.name}"`)) continue;
          const pool = domainRef.mapping?.[entry.name]?.featPool
            ?? domainRef.mapping?.overrides?.[entry.name]?.featPool;
          if (pool) names.add(pool.aptitude);
        }
      }
    }
  }

  // Wizard school aptitudes
  const wsRefPath = join(refBase, book, "wizardSchools.json");
  if (existsSync(wsRefPath)) {
    const wsRef = JSON.parse(readFileSync(wsRefPath, "utf-8"));
    for (const school of buildWizardSchoolSeeds(wsRef)) {
      names.add(`${school.name} Specialist Spells`);
    }
  }

  // For extension books: collect aptitudes referenced by this book's spells
  // so we can keep sibling spell list aptitudes (each extension creates its own copy).
  const spellAptitudes = new Set<string>();
  if (book !== "srd") {
    const spellRefPath = join(refBase, book, "spells.json");
    if (existsSync(spellRefPath)) {
      const spellRef = JSON.parse(readFileSync(spellRefPath, "utf-8"));
      const { spells } = buildSpellSeeds(spellRef, book);
      for (const spell of spells) {
        for (const apt of spell.aptitudes) spellAptitudes.add(apt);
      }
    }
  }

  // Exclude aptitudes created by other books (class features + spell lists).
  // For sibling extension spell lists, keep them if this book's spells reference them.
  for (const other of readdirSync(refBase, { withFileTypes: true })) {
    if (!other.isDirectory() || other.name === book) continue;
    const isSibling = other.name !== "srd" && book !== "srd";
    const otherClassDir = join(refBase, other.name, "classes");
    if (!existsSync(otherClassDir)) continue;
    for (const f of readdirSync(otherClassDir).filter((f) => f.endsWith(".json"))) {
      const ref: ClassReference = JSON.parse(readFileSync(join(otherClassDir, f), "utf-8"));
      const seeds = buildClassSeeds(ref);
      if (seeds.class?.classFeatureAptitude) names.delete(seeds.class.classFeatureAptitude);
      const spellApt = seeds.class?.spells ? `${seeds.class.name} Spells` : null;
      if (spellApt) {
        if (isSibling && spellAptitudes.has(spellApt)) {
          names.add(spellApt);
        } else {
          names.delete(spellApt);
        }
      }
    }
  }

  return [...names].sort();
}

// ---------------------------------------------------------------------------
// Template expansion
// ---------------------------------------------------------------------------

function expandTemplateFeat(
  entry: FeatReference["raw"][number],
  detected: FeatReference["detected"][string],
  mapped: FeatReference["mapping"][string],
  allTemplateNames: Set<string>,
): FeatSeed[] {
  const template = mapped.template!;
  const aptitudes = mapped.aptitudes ?? [];
  const modifiers = mapped.modifiers ?? [];
  const requirements = mapped.requirements ?? [];
  const featNameMap = detected?.featNameMap ?? {};
  const familyName = template.familyName;

  let items: string[];
  switch (template.type) {
    case "weapon":
      if (familyName === "Martial Weapon Proficiency") items = MARTIAL_WEAPONS;
      else if (familyName === "Exotic Weapon Proficiency") items = EXOTIC_WEAPONS;
      else items = ALL_WEAPONS;
      break;
    case "crossbow":
      items = ALL_WEAPONS.filter((w) => w.toLowerCase().includes("crossbow"));
      break;
    case "skill":
      items = SKILL_NAMES;
      break;
    case "school":
      items = MAGIC_SCHOOLS;
      break;
    default:
      return [];
  }

  return items.map((item) => {
    const slug = stripSeparators(item);

    // Expand per-item modifiers
    let itemModifiers: ModifierSeed[] = [];
    if (modifiers.length > 0) {
      itemModifiers = modifiers.map((m) => ({
        ...m,
        target: m.target
          .replace(/skills\.[^.]+/, `skills.${slug}`)
          .replace(/^combat\./, `items.weapons.${slug}.`)
          .replace(/powers\.groups\.[^.]+\./, `powers.groups.${slug}.`),
      }));
    } else if (template.type === "skill") {
      itemModifiers = [{ target: `skills.${slug}.misc`, operator: "add", value: "3", valueType: "number" }];
    } else if (template.type === "school") {
      itemModifiers = [{ target: `powers.groups.${slug}.*.dc.misc`, operator: "add", value: "1", valueType: "number" }];
    }

    // Expand per-item requirements
    const itemReqs = expandRequirements(template.type, familyName, item, requirements, featNameMap, allTemplateNames);

    const seed: FeatSeed = {
      name: `${familyName}: ${item}`,
      description: normalizeDescription(expandTemplateDescription(mapped.description ?? entry.benefit, template.type, item)),
      aptitudes,
      ...(itemReqs.length > 0 ? { requirements: itemReqs } : {}),
      ...(itemModifiers.length > 0 ? { modifiers: itemModifiers } : {}),
      properties: [{ type: "FEAT_FAMILY", value: familyName }],
    };
    return seed;
  });
}

// ---------------------------------------------------------------------------
// Requirement helpers
// ---------------------------------------------------------------------------

function eqFeat(name: string): RequirementEntry {
  return { target: `feats.${stripSeparators(name)}.possessed`, operator: "equal", value: "true", valueType: "boolean" };
}

function neFeat(name: string): RequirementEntry {
  return { target: `feats.${stripSeparators(name)}.possessed`, operator: "not_equal", value: "true", valueType: "boolean" };
}

function proficiencyReqs(weapon: string): RequirementEntry[] {
  if (SIMPLE_SET.has(weapon)) return [
    { chainingOperator: "or", children: [eqFeat("Simple Weapon Proficiency"), eqFeat(`Simple Weapon Proficiency: ${weapon}`)] },
  ];
  if (MARTIAL_SET.has(weapon)) return [
    { chainingOperator: "or", children: [eqFeat("Martial Weapon Proficiency"), eqFeat(`Martial Weapon Proficiency: ${weapon}`)] },
  ];
  return [eqFeat(`Exotic Weapon Proficiency: ${weapon}`)];
}

function expandRequirements(
  type: string,
  familyName: string,
  item: string,
  detectedReqs: RequirementEntry[],
  featNameMap: Record<string, string>,
  allTemplateNames: Set<string>,
): RequirementEntry[] {
  if (type === "weapon" || type === "crossbow") {
    return expandWeaponRequirements(familyName, item, detectedReqs, featNameMap, allTemplateNames);
  }
  if (type === "school") {
    return expandSchoolRequirements(detectedReqs, item, featNameMap, allTemplateNames);
  }
  return [];
}

function expandWeaponRequirements(
  familyName: string,
  weapon: string,
  detectedReqs: RequirementEntry[],
  featNameMap: Record<string, string>,
  allTemplateNames: Set<string>,
): RequirementEntry[] {
  const reqs: RequirementEntry[] = [];

  // Proficiency requirements
  if (familyName === "Weapon Focus" || familyName === "Improved Critical") {
    reqs.push(...proficiencyReqs(weapon));
  }

  // Martial Weapon Proficiency: individual feats require NOT having the blanket proficiency
  if (familyName === "Martial Weapon Proficiency") {
    reqs.push(neFeat("Martial Weapon Proficiency"));
    return reqs;
  }

  // Static + expanded requirements
  for (const req of detectedReqs) {
    if ("chainingOperator" in req) continue;
    if (req.target === "combat.bab") {
      reqs.push(req);
    } else if (req.target.startsWith("classes.") || req.target.startsWith("abilities.")) {
      reqs.push(req);
    } else if (req.target.startsWith("feats.")) {
      const featSlug = req.target.replace(/^feats\./, "").replace(/\.possessed$/, "");
      const featName = featNameMap[featSlug];
      if (featName && allTemplateNames.has(featName)) {
        reqs.push(eqFeat(`${featName}: ${weapon}`));
      } else if (featName) {
        reqs.push(eqFeat(featName));
      }
    }
  }

  return reqs;
}

// ---------------------------------------------------------------------------
// Spell reference → PowerSeed[] (grouped by level)
// ---------------------------------------------------------------------------

/**
 * Build class name → aptitude name mappings by scanning all class reference files.
 * Any class with a `mapping.spells` config gets an entry: "ClassName" → "ClassName Spells".
 * Also includes legacy abbreviations for the SRD single-page parser.
 */
function buildClassSpellMaps(): { classMap: Record<string, string>; dualMap: Record<string, string[]> } {
  const classMap: Record<string, string> = {
    // Legacy SRD abbreviations (single-page parser uses these)
    "Sor/Wiz": "Wizard Spells",
    "Wiz": "Wizard Spells",
    "Sor": "Sorcerer Spells",
    "Clr": "Cleric Spells",
    "Brd": "Bard Spells",
    "Drd": "Druid Spells",
    "Pal": "Paladin Spells",
    "Rgr": "Ranger Spells",
  };

  const dualMap: Record<string, string[]> = {
    "Sor/Wiz": ["Wizard Spells", "Sorcerer Spells"],
    "sorcerer/wizard": ["Wizard Spells", "Sorcerer Spells"],
  };

  // Auto-discover from class references (scoped to book if provided)
  const refBase = join(import.meta.dirname!, "../reference");
  if (existsSync(refBase)) {
    const books = readdirSync(refBase);
    for (const book of books) {
      // Discover casting classes
      const classDir = join(refBase, book, "classes");
      if (existsSync(classDir)) {
        for (const file of readdirSync(classDir)) {
          if (!file.endsWith(".json")) continue;
          try {
            const ref = JSON.parse(readFileSync(join(classDir, file), "utf-8")) as ClassReference;
            if (ref.mapping?.spells && ref.raw?.name) {
              const aptName = `${ref.raw.name} Spells`;
              classMap[ref.raw.name] = aptName;
              classMap[ref.raw.name.toLowerCase()] = aptName;
            }
          } catch { /* skip malformed files */ }
        }
      }

      // Note: domain entries (Air, Fire, Courage, etc.) are NOT mapped here.
      // Domain spell linking is handled separately by seed-domains.ts, which
      // links spells to domain aptitudes by name. Adding them here would cause
      // duplicate links and broken class-level requirements.
    }
  }

  return { classMap, dualMap };
}

let _classSpellMaps: ReturnType<typeof buildClassSpellMaps> | undefined;
function getClassSpellMaps() {
  if (!_classSpellMaps) _classSpellMaps = buildClassSpellMaps();
  return _classSpellMaps;
}

/** Class name → aptitude name (auto-discovered from class references) */
function getClassAbbrevMap(): Record<string, string> { return getClassSpellMaps().classMap; }

/** Combined class entries that map to multiple aptitudes */
function getDualClassMap(): Record<string, string[]> { return getClassSpellMaps().dualMap; }

const COMPONENT_MAP: Record<string, string> = {
  "V": "Verbal",
  "S": "Somatic",
  "M": "Material",
  "F": "Focus",
  "DF": "Divine Focus",
  "XP": "XP Cost",
};

function simplifyRange(range: string): string {
  // Strip leaked "Area/Effect/Target:" labels from upstream parser glitches
  // (e.g. "Touch Area/Effect/Target: Animal touched" → "Touch")
  const stripped = range.replace(/\s+(Area|Effect|Target)\/.*$/i, "").trim();
  if (stripped.startsWith("Close")) return "Close";
  if (stripped.startsWith("Medium")) return "Medium";
  if (stripped.startsWith("Long")) return "Long";
  return stripped;
}

const SUBSCHOOL_CANON: Record<string, string> = Object.fromEntries(
  ["Calling", "Charm", "Compulsion", "Creation", "Figment", "Glamer", "Healing", "Pattern", "Phantasm", "Polymorph", "Scrying", "Shadow", "Summoning", "Teleportation"]
    .map((s) => [s.toLowerCase(), s]),
);

function normalizeSubschool(value: string): string {
  // "divination (scrying)" → "Scrying"; "teleportation" → "Teleportation"
  const parenMatch = value.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const inner = parenMatch[1].trim().toLowerCase();
    if (SUBSCHOOL_CANON[inner]) return SUBSCHOOL_CANON[inner];
  }
  const lower = value.trim().toLowerCase();
  return SUBSCHOOL_CANON[lower] ?? value;
}

function normalizeDescriptor(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  // Only normalize all-lowercase scrapes (e.g. "good"); leave mixed-case
  // compounds like "Fire or Cold" or "Mind-Affecting" untouched.
  if (trimmed !== trimmed.toLowerCase()) return trimmed;
  return trimmed.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("-");
}

function normalizeSpellResistance(value: string): string {
  // Lowercase the canonical "(harmless)" / "(harmless, object)" parenthetical
  return value.replace(/\(Harmless/g, "(harmless");
}

/** Compound component forms used in manual seeds: "M/DF" → "Material/Divine Focus" */
const COMPOUND_COMPONENT_MAP: Record<string, string> = {
  "M/DF": "Material/Divine Focus",
  "F/DF": "Focus/Divine Focus",
};

function expandComponents(components: string[]): string[] {
  const result: string[] = [];
  for (const comp of components) {
    const compound = COMPOUND_COMPONENT_MAP[comp.trim()];
    if (compound) {
      if (!result.includes(compound)) result.push(compound);
      continue;
    }
    const mapped = COMPONENT_MAP[comp.trim()];
    if (mapped && !result.includes(mapped)) result.push(mapped);
  }
  return result;
}

/** Collapse whitespace/newlines and normalize spell stat text */
function normalizeSpellText(text: string): string {
  return sanitizeText(text)
    .replace(/\s+/g, " ")           // collapse newlines/whitespace
    .replace(/(\d+)\s*\/\s*/g, "$1/")  // "1 round/ level" → "1 round/level"
    .trim();
}

export type SpellSeedWithLevel = PowerSeed & { level: number };

export function buildSpellSeeds(ref: SpellReference, _book?: string): { spells: SpellSeedWithLevel[] } {
  // Build name lookup (case-insensitive) for base spell resolution
  const rawByName = new Map<string, SpellReference["raw"][number]>();
  for (const entry of ref.raw) {
    rawByName.set(entry.name.toLowerCase(), entry);
  }

  /**
   * Resolve a "functions like" base spell reference to a raw entry.
   * Handles patterns: "interposing hand" → "Bigby's Interposing Hand",
   * "mass cure light wounds" → "Cure Light Wounds, Mass", etc.
   */
  function resolveBaseSpell(refText: string): SpellReference["raw"][number] | undefined {
    const lower = refText.toLowerCase();
    // Direct match
    if (rawByName.has(lower)) return rawByName.get(lower);
    // "mass X" → "X, Mass"
    const massMatch = lower.match(/^(greater|lesser|mass)\s+(.+)$/);
    if (massMatch) {
      const reordered = `${massMatch[2]}, ${massMatch[1]}`;
      if (rawByName.has(reordered)) return rawByName.get(reordered);
    }
    // Partial match: "interposing hand" should match "Bigby's Interposing Hand"
    for (const [name, entry] of rawByName) {
      if (name.endsWith(lower) || name.endsWith(` ${lower}`)) return entry;
    }
    return undefined;
  }

  const spells: SpellSeedWithLevel[] = [];

  for (const rawEntry of ref.raw) {
    // Resolve missing fields from base spell (SRD "functions like X" pattern).
    // Follows the chain: e.g. Mass Charm Monster → Charm Monster → Charm Person.
    let entry = rawEntry;
    const hasMissing = !entry.range || !entry.duration || entry.components.length === 0
      || !entry.savingThrow || !entry.spellResistance || !entry.castingTime;
    if (hasMissing) {
      // Walk the "functions like" chain up to 3 levels deep
      let current: SpellReference["raw"][number] | undefined = entry;
      const visited = new Set<string>([entry.name]);
      for (let depth = 0; depth < 3 && current; depth++) {
        const baseMatch = current.description.match(/(?:functions? like|works like|functions? similarly to|[Ss]imilar to)\s+(.+?)(?:,|\.| except| but)/i);
        if (!baseMatch) break;
        const baseRef = baseMatch[1].trim().replace(/^a /i, "").replace(/\.$/, "");
        const base = resolveBaseSpell(baseRef);
        if (!base || visited.has(base.name)) break;
        visited.add(base.name);

        entry = {
          ...entry,
          castingTime: entry.castingTime || base.castingTime,
          range: entry.range || base.range,
          duration: entry.duration || base.duration,
          components: entry.components.length > 0 ? entry.components : base.components,
          // Only inherit target/area/effect if this spell has none at all
          ...(!entry.target && !entry.effect && !entry.area ? {
            target: base.target,
            effect: base.effect,
            area: base.area,
          } : {}),
          // Only inherit savingThrow/spellResistance if truly empty (not scraped)
          savingThrow: entry.savingThrow || base.savingThrow,
          spellResistance: entry.spellResistance || base.spellResistance,
        };
        // Continue walking if still missing fields
        const stillMissing = !entry.range || !entry.duration || entry.components.length === 0
          || !entry.savingThrow || !entry.spellResistance || !entry.castingTime;
        if (!stillMissing) break;
        current = base;
      }
    }

    // Determine aptitudes and per-aptitude level for each class
    const aptitudes = new Set<string>();
    const aptitudeLevels: Record<string, number> = {};
    let minLevel = 99;

    const classAbbrevMap = getClassAbbrevMap();
    const dualClassMap = getDualClassMap();
    for (const le of entry.levelEntries) {
      const dual = dualClassMap[le.className];
      if (dual) {
        for (const a of dual) {
          aptitudes.add(a);
          aptitudeLevels[a] = aptitudeLevels[a] !== undefined ? Math.min(aptitudeLevels[a], le.level) : le.level;
        }
        minLevel = Math.min(minLevel, le.level);
      } else {
        const apt = classAbbrevMap[le.className];
        if (apt) {
          aptitudes.add(apt);
          aptitudeLevels[apt] = aptitudeLevels[apt] !== undefined ? Math.min(aptitudeLevels[apt], le.level) : le.level;
          minLevel = Math.min(minLevel, le.level);
        }
      }
    }

    // Fallback: if no mapped entries found, use the lowest level from any entry
    if (minLevel === 99) {
      for (const le of entry.levelEntries) {
        minLevel = Math.min(minLevel, le.level);
      }
    }
    if (minLevel === 99) minLevel = 0;

    // Build properties
    const properties: { type: string; value: string }[] = [];
    properties.push({ type: "SPELL_SCHOOL", value: entry.school });
    if (entry.subschool) properties.push({ type: "SPELL_SUBSCHOOL", value: normalizeSubschool(entry.subschool) });
    for (const desc of entry.descriptors) {
      properties.push({ type: "SPELL_DESCRIPTOR", value: normalizeDescriptor(desc) });
    }
    properties.push({ type: "SPELL_CASTING_TIME", value: normalizeSpellText(entry.castingTime || "1 standard action") });
    const rangeValue = simplifyRange(normalizeSpellText(entry.range));
    if (rangeValue) properties.push({ type: "SPELL_RANGE_TYPE", value: rangeValue });
    const targetValue = entry.target ? normalizeSpellText(entry.target) : undefined;
    if (targetValue) properties.push({ type: "SPELL_TARGET", value: targetValue });
    if (entry.area) properties.push({ type: "SPELL_AREA_OF_EFFECT", value: normalizeSpellText(entry.area) });
    const effectValue = entry.effect ? normalizeSpellText(entry.effect) : undefined;
    if (effectValue && effectValue !== targetValue) properties.push({ type: "SPELL_TARGET", value: effectValue });
    properties.push({ type: "SPELL_DURATION", value: normalizeSpellText(entry.duration) });
    properties.push({ type: "SPELL_RESISTANCE", value: normalizeSpellResistance(normalizeSpellText(entry.spellResistance || "No")) });
    for (const compName of expandComponents(entry.components)) {
      properties.push({ type: "SPELL_COMPONENT", value: compName });
    }

    const savingThrow = normalizeSpellText(entry.savingThrow || "None");
    // Only include aptitudeLevels when not all aptitudes share the same level
    const hasVaryingLevels = Object.values(aptitudeLevels).some((l) => l !== minLevel);
    const seed: SpellSeedWithLevel = {
      name: entry.name,
      description: normalizeDescription(ref.mapping?.overrides?.[entry.name]?.description ?? entry.description),
      aptitudes: [...aptitudes].sort(),
      ...(hasVaryingLevels ? { aptitudeLevels } : {}),
      savingThrow,
      properties,
      level: minLevel,
    };

    spells.push(seed);
  }

  // Sort by level, then name
  spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  return { spells };
}

function expandSchoolRequirements(
  detectedReqs: RequirementEntry[],
  school: string,
  featNameMap: Record<string, string>,
  allTemplateNames: Set<string>,
): RequirementEntry[] {
  const reqs: RequirementEntry[] = [];
  for (const req of detectedReqs) {
    if ("chainingOperator" in req) continue;
    if (req.target.startsWith("feats.")) {
      const featSlug = req.target.replace(/^feats\./, "").replace(/\.possessed$/, "");
      const featName = featNameMap[featSlug];
      if (featName && allTemplateNames.has(featName)) {
        reqs.push(eqFeat(`${featName}: ${school}`));
      }
    }
  }
  return reqs;
}

// ---------------------------------------------------------------------------
// Item reference → ItemDef[]
// ---------------------------------------------------------------------------

export type ItemSeedSets = {
  simpleWeapons: ItemDef[];
  martialWeapons: ItemDef[];
  exoticWeapons: ItemDef[];
  armor: ItemDef[];
  shields: ItemDef[];
  goods: ItemDef[];
};

export function buildItemSeeds(ref: ItemReference): ItemSeedSets {
  const simpleWeapons: ItemDef[] = [];
  const martialWeapons: ItemDef[] = [];
  const exoticWeapons: ItemDef[] = [];
  const armor: ItemDef[] = [];
  const shields: ItemDef[] = [];
  const goods: ItemDef[] = [];

  // Build weapons
  for (const [srdName, det] of Object.entries(ref.detected.weapons)) {
    if (!det.generatorName) continue;
    const ovr = ref.mapping.overrides[srdName];
    if (ovr?.skip) continue;
    if (ref.mapping[srdName]?.skip) continue;

    const costGp = ovr?.costGp ?? ref.mapping[srdName]?.costGp ?? det.costGp;
    const weight = ovr?.weight ?? ref.mapping[srdName]?.weight ?? det.weight;
    // Find the raw entry for category info
    const rawWeapon = ref.raw.weapons.find((w) => w.name === srdName);
    const category = rawWeapon?.category?.replace(/ Weapons?$/, "").toLowerCase() ?? "";
    const description = ovr?.description ?? ref.mapping[srdName]?.description
      ?? `A ${category ? `${category} ` : ""}${det.proficiency.toLowerCase()} weapon.`;

    const seed: ItemDef = {
      name: det.generatorName,
      description,
      weight,
      costGp,
      type: "Weapon",
      properties: [], // filled at runtime via weaponProperties()
    };

    if (det.proficiency === "Simple") simpleWeapons.push(seed);
    else if (det.proficiency === "Martial") martialWeapons.push(seed);
    else exoticWeapons.push(seed);
  }

  // Build armor & shields
  for (const [srdName, det] of Object.entries(ref.detected.armor)) {
    if (!det.generatorName) continue;
    const ovr = ref.mapping.overrides[srdName];
    if (ovr?.skip) continue;
    if (ref.mapping[srdName]?.skip) continue;

    const costGp = ovr?.costGp ?? ref.mapping[srdName]?.costGp ?? det.costGp;
    const weight = ovr?.weight ?? ref.mapping[srdName]?.weight ?? det.weight;
    const categoryLabel = det.proficiencyCategory.replace(/ armor$/i, "");
    const description = ovr?.description ?? ref.mapping[srdName]?.description
      ?? `${det.type === "Shield" ? "A shield" : `${categoryLabel} armor`}.`;

    const seed: ItemDef = {
      name: det.generatorName,
      description,
      weight,
      costGp,
      type: det.type,
      ...(det.type === "Armor" ? { slot: "Torso" as const } : { slot: "Off Hand" as const }),
      properties: [], // filled at runtime via armorProperties()/shieldProperties()
    };

    if (det.type === "Shield") shields.push(seed);
    else armor.push(seed);
  }

  // Build goods
  for (const [name, det] of Object.entries(ref.detected.goods)) {
    const ovr = ref.mapping.overrides[name];
    if (ovr?.skip) continue;
    if (ref.mapping[name]?.skip) continue;

    const costGp = ovr?.costGp ?? ref.mapping[name]?.costGp ?? det.costGp;
    const weight = ovr?.weight ?? ref.mapping[name]?.weight ?? det.weight;
    const description = ovr?.description ?? ref.mapping[name]?.description ?? "";

    goods.push({
      name,
      description,
      weight,
      costGp,
      type: "Other",
      slot: "Other" as const,
      properties: [],
    });
  }

  return { simpleWeapons, martialWeapons, exoticWeapons, armor, shields, goods };
}

// ---------------------------------------------------------------------------
// Magic item reference → ItemDef[] (grouped by category)
// ---------------------------------------------------------------------------

export type MagicItemSeedSets = {
  magicArmor: ItemDef[];
  magicShields: ItemDef[];
  magicWeapons: ItemDef[];
  wondrousItems: ItemDef[];
  rings: ItemDef[];
  rods: ItemDef[];
  staffs: ItemDef[];
};

export function buildMagicItemSeeds(ref: MagicItemReference): MagicItemSeedSets {
  const magicArmor: ItemDef[] = [];
  const magicShields: ItemDef[] = [];
  const magicWeapons: ItemDef[] = [];
  const wondrousItems: ItemDef[] = [];
  const rings: ItemDef[] = [];
  const rods: ItemDef[] = [];
  const staffs: ItemDef[] = [];

  const categoryBuckets: Record<string, ItemDef[]> = {
    specificArmor: magicArmor,
    specificShield: magicShields,
    specificWeapon: magicWeapons,
    wondrousItem: wondrousItems,
    ring: rings,
    rod: rods,
    staff: staffs,
  };

  for (const [name, det] of Object.entries(ref.detected)) {
    const ovr = ref.mapping.overrides?.[name];
    if (ovr?.skip) continue;
    if (ref.mapping[name]?.skip) continue;

    const costGp = ovr?.costGp ?? ref.mapping[name]?.costGp ?? det.costGp;
    const weight = ovr?.weight ?? ref.mapping[name]?.weight ?? det.weight;
    const slot = ovr?.slot ?? ref.mapping[name]?.slot ?? det.slot;
    // Find the raw entry for description
    const rawEntry = ref.raw.find((r) => r.name === name);
    const baseItemRaw = ovr?.baseItem !== undefined ? ovr.baseItem
      : ref.mapping[name]?.baseItem !== undefined ? ref.mapping[name]!.baseItem
      : det.baseItem ?? detectBaseItem(name, rawEntry?.description ?? "", det.category);
    const sourceItem = baseItemRaw ?? undefined;

    const description = normalizeDescription(
      ovr?.description ?? ref.mapping[name]?.description ?? rawEntry?.description ?? "",
    );

    const aura = ovr?.aura ?? det.aura;
    const casterLevel = ovr?.casterLevel ?? det.casterLevel;
    const properties: { type: string; value: string }[] = [];
    if (aura) properties.push({ type: "MAGIC_AURA", value: aura });
    if (casterLevel) properties.push({ type: "MAGIC_CASTER_LEVEL", value: String(casterLevel) });

    const bucket = categoryBuckets[det.category];
    if (!bucket) continue;

    // Prefix ring/rod/staff names with their category when the SRD heading is just the bare name
    const CATEGORY_PREFIX: Partial<Record<string, string>> = { ring: "Ring", rod: "Rod", staff: "Staff" };
    const categoryWord = CATEGORY_PREFIX[det.category];
    let itemName = name;
    if (categoryWord) {
      // Normalize plural category in name: "Metamagic Rods" → "Metamagic Rod"
      itemName = itemName.replace(/\bRods\b/g, "Rod").replace(/\bRings\b/g, "Ring").replace(/\bStaffs\b/g, "Staff");
      if (!new RegExp(`\\b${categoryWord}\\b`, "i").test(itemName)) {
        itemName = `${categoryWord} of ${itemName}`;
      }
    }

    bucket.push({
      name: itemName,
      description,
      weight,
      costGp,
      type: det.itemType,
      slot: slot as ItemDef["slot"],
      properties,
      ...(sourceItem ? { sourceItem } : {}),
      ...(det.modifiers?.length ? { modifiers: det.modifiers } : {}),
    });
  }

  return { magicArmor, magicShields, magicWeapons, wondrousItems, rings, rods, staffs };
}
