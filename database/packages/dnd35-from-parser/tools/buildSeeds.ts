/**
 * Shared module: builds ClassSeed / FeatSeed objects from reference JSON.
 *
 * Used by the generator to produce .ts seed files and collect aptitudes.
 * This is the single source of truth for "reference JSON → seed object" conversion.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { classReferences, loadReference } from "@/database/packages/dnd35-from-parser/tools/references.ts";
import { sanitizeText } from "@/database/packages/dnd35-from-parser/tools/sanitize.ts";
import { readArmorStats } from "@/database/packages/dnd35-from-parser/tools/scraper/armorStats.ts";
import { detectBaseItem } from "@/database/packages/dnd35-from-parser/tools/scraper/detectMagicItem.ts";
import { familyFeatNamed } from "@/database/packages/dnd35-from-parser/tools/scraper/featOptions.ts";
import { readWeaponEnhancement } from "@/database/packages/dnd35-from-parser/tools/scraper/weaponStats.ts";
import {
  autoCompanionGrantModifiers,
  autoUncannyDodgeModifiers,
  checkedValue,
  checkOneOf,
  extractGrantedFeatNames,
  matchesWithPluralVariants,
  normalizeDescription,
  normalizeWs,
  pluralVariants,
  REFERENCE_DIR,
  referenceBooks,
  stripClassSuffix,
  stripSeparators,
} from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import type {
  AptitudePick,
  BonusFeatList,
  ClassReference,
  DomainReference,
  InheritedSpellList,
  ItemReference,
  MagicItemCategory,
  MagicItemReference,
  RaceReference,
  SpellReference,
  WizardSchoolReference,
} from "@/database/packages/dnd35-from-parser/tools/types.ts";
import { FAVORED_ENEMY_FAMILY } from "@/database/packages/dnd35/content/creatureTypes.ts";
import { armorProperties } from "@/database/packages/dnd35/content/items.ts";
import { feat, gte } from "@/database/packages/dnd35/content/requirements.ts";
import type {
  DomainDefinition,
  FeatSeed,
  ItemDef,
  Modifier,
  ModifierSeed,
  PowerSeed,
  Property,
  RaceDefinition,
  RequirementEntry,
  WizardSchoolDefinition,
} from "@/database/packages/dnd35/content/types.ts";
import {
  ALL_WEAPONS,
  EXOTIC_WEAPONS,
  MARTIAL_WEAPONS,
  SIMPLE_WEAPONS,
} from "@/database/packages/dnd35/content/weapons.ts";
import { CLASS_FEATURE_FAMILIES } from "@/shared/dnd3.5/feats.ts";
import {
  FEAT_FAMILY,
  MAGIC_AURA,
  MAGIC_CASTER_LEVEL,
  SPELL_AREA_OF_EFFECT,
  SPELL_CASTING_TIME,
  SPELL_COMPONENT,
  SPELL_DESCRIPTOR,
  SPELL_DURATION,
  SPELL_RANGE_TYPE,
  SPELL_RESISTANCE,
  SPELL_SCHOOL,
  SPELL_SUBSCHOOL,
  SPELL_TARGET,
} from "@/shared/dnd3.5/properties/index.ts";
import { LOCATION_OPTIONS, SIZE_OPTIONS } from "@/shared/enums.ts";
import { capitalize } from "@/shared/text.ts";

type PerLevelExpansion = { newTarget: string; levels: number[]; ordinal: string };

export type SpellSeedWithLevel = PowerSeed & { level: number };

export type ItemSeedSets = {
  simpleWeapons: ItemDef[];
  martialWeapons: ItemDef[];
  exoticWeapons: ItemDef[];
  armor: ItemDef[];
  shields: ItemDef[];
  goods: ItemDef[];
};

export type MagicItemSeedSets = {
  magicArmor: ItemDef[];
  magicShields: ItemDef[];
  magicWeapons: ItemDef[];
  wondrousItems: ItemDef[];
  rings: ItemDef[];
  rods: ItemDef[];
  staffs: ItemDef[];
};

// ---------------------------------------------------------------------------
// Existing feat lookup — set of known feat names
// Used to detect when a class feature duplicates an existing feat
// ---------------------------------------------------------------------------

const _existingFeatsCache = new Map<string, Set<string>>();

const _existingFeatSlugsCache = new Map<string, Map<string, string>>();

const CLASS_FEAT_FAMILIES: { pattern: RegExp; family: string }[] = [
  { pattern: /^(?:Turn or Rebuke Undead|Turn Undead|Rebuke Undead)\b/i, family: "Turn or Rebuke Undead" },
  { pattern: /^Wild Shape\b/i, family: "Wild Shape" },
  // "Grace (Duelist)", not "Grace of the Dark"; "Rage (Barbarian)", not "Rage +1 Use/day"
  ...CLASS_FEATURE_FAMILIES.map((family) => ({ pattern: new RegExp(`^${RegExp.escape(family)} \\(`), family })),
];

/** The families of class features, Favored Enemy's included, which a prerequisite checks by the family's name. */
export const CLASS_FEAT_FAMILY_NAMES = [...CLASS_FEAT_FAMILIES.map(({ family }) => family), FAVORED_ENEMY_FAMILY];

let _classSpellMaps: ReturnType<typeof buildClassSpellMaps> | undefined;

const COMPONENT_MAP: Record<string, string> = {
  V: "Verbal",
  S: "Somatic",
  M: "Material",
  F: "Focus",
  DF: "Divine Focus",
  XP: "XP Cost",
};

const SUBSCHOOL_CANON: Record<string, string> = Object.fromEntries(
  [
    "Calling",
    "Charm",
    "Compulsion",
    "Creation",
    "Figment",
    "Glamer",
    "Healing",
    "Pattern",
    "Phantasm",
    "Polymorph",
    "Scrying",
    "Shadow",
    "Summoning",
    "Teleportation",
  ].map((s) => [s.toLowerCase(), s]),
);

/** Compound component forms used in manual seeds: "M/DF" → "Material/Divine Focus" */
const COMPOUND_COMPONENT_MAP: Record<string, string> = {
  "M/DF": "Material/Divine Focus",
  "F/DF": "Focus/Divine Focus",
};

// ---------------------------------------------------------------------------
// Magic item reference → ItemDef[] (grouped by category)
// ---------------------------------------------------------------------------

/** The word a ring's, a rod's or a staff's name holds, prefixed when the SRD heading is just the bare name. */
const CATEGORY_PREFIX: Partial<Record<MagicItemCategory, string>> = { ring: "Ring", rod: "Rod", staff: "Staff" };

/** The specific armor and shields, whose text gives what they change of their base's. */
const ARMOR_CATEGORIES = new Set<MagicItemCategory>(["specificArmor", "specificShield"]);

function loadExistingFeats(book?: string): Set<string> {
  const key = book ?? "__srd__";
  if (_existingFeatsCache.has(key)) return _existingFeatsCache.get(key)!;

  const feats = new Set<string>();
  // Load feat names from SRD (parent) and the current book's reference JSON.
  // Skip template feats (family parents like "Weapon Specialization") — they
  // expand into per-variant feats during generation and the bare name is never
  // seeded, so matching against it would create phantom freeFeat lookups.
  const books = book ? [book, "srd"] : ["srd"];
  for (const b of books) {
    const featsPath = join(REFERENCE_DIR, b, "feats.json");
    if (!existsSync(featsPath)) continue;
    const ref = loadReference(featsPath, "feat");
    for (const feat of ref.raw) {
      const mapped = ref.mapping[feat.name];
      if (mapped?.template) continue;
      feats.add(feat.name);
    }
  }

  _existingFeatsCache.set(key, feats);
  return feats;
}

/**
 * The existing feat a name means: one by its letters (a class feature's "Two-weapon Fighting" is Two-Weapon Fighting),
 * or a family's feat for the option the name holds ("Skill Focus (Bluff)": Skill Focus: Bluff).
 */
function existingFeatNamed(book: string, name: string): string | undefined {
  let bySlug = _existingFeatSlugsCache.get(book);
  if (!bySlug) {
    bySlug = new Map([...loadExistingFeats(book)].map((feat) => [stripSeparators(feat), feat]));
    _existingFeatSlugsCache.set(book, bySlug);
  }
  return bySlug.get(stripSeparators(name)) ?? familyFeatNamed(name);
}

/** Merge detected aptitude picks with overrides. Overrides win per-target; detected picks not in overrides are preserved. */
function mergeAptitudePicks(detected?: AptitudePick[], overrides?: AptitudePick[]): AptitudePick[] | undefined {
  if (!overrides) return detected;
  if (!detected) return overrides;
  const overrideTargets = new Set(overrides.map((p) => p.target));
  return [...detected.filter((p) => !overrideTargets.has(p.target)), ...overrides];
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

function detectClassFeatFamily(name: string): string | undefined {
  for (const { pattern, family } of CLASS_FEAT_FAMILIES) {
    if (pattern.test(name)) return family;
  }
  return undefined;
}

/** A table cell's number: "+10 ft." is 10, "−2" (a typographic minus) is -2, a dash none. */
const cellNumber = (cell: string) => Number(cell.replace("\u2212", "-").match(/[+-]?\d+/)?.[0] ?? 0);

// ---------------------------------------------------------------------------
// Domain feat pool → FeatSeed[] (e.g. War Domain Weapon feats)
// ---------------------------------------------------------------------------

function resolveFeatPoolItems(items: "martial" | "simple" | "exotic" | "all" | string[]): string[] {
  if (Array.isArray(items)) return items;
  switch (items) {
    case "martial":
      return MARTIAL_WEAPONS;
    case "simple":
      return SIMPLE_WEAPONS;
    case "exotic":
      return EXOTIC_WEAPONS;
    case "all":
      return ALL_WEAPONS;
  }
}

function buildDomainFeatPoolSeeds(ref: DomainReference): FeatSeed[] {
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
        type: FEAT_FAMILY,
        value: family,
      }));

      const description = pool.description
        ? pool.description.replace(/\$\{w\}/g, item)
        : `Granted by the ${entry.name} domain.`;

      results.push({
        name: `${pool.namePrefix}: ${item}`,
        description,
        generated: true,
        aptitudes: [pool.aptitude],
        modifiers,
        properties,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Domain reference → DomainDefinition[]
// ---------------------------------------------------------------------------

/** A domain of the domains reference, as its mapping and overrides make it. */
function domainSeed(ref: DomainReference, entry: DomainReference["raw"][number]): DomainDefinition {
  const mapping = ref.mapping?.[entry.name];
  const override = ref.overrides?.[entry.name];
  const spellSource = override?.spells ?? entry.spells;

  return {
    name: override?.name ?? entry.name,
    description: mapping?.description ?? entry.description,
    ...(mapping?.modifiers?.length ? { modifiers: mapping.modifiers } : {}),
    spells: spellSource
      .map((s) => ({ name: s.name, level: s.level }))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
  };
}

/** The spells a book's domains can name, by their lowercase name: the core rules' and the book's. */
export function domainSpellNames(book: string): Map<string, string> {
  const spellNames = (b: string) => {
    const path = join(REFERENCE_DIR, b, "spells.json");
    return existsSync(path) ? loadReference(path, "spell").raw.map((spell) => spell.name) : [];
  };
  return new Map(
    [...spellNames("srd"), ...(book === "srd" ? [] : spellNames(book))].map((name) => [name.toLowerCase(), name]),
  );
}

/**
 * A domains reference's domains, as their mapping and overrides make them, their spells named as the spell references
 * name them. `parser:validate` reports a spell neither the core rules nor the book has.
 */
function domainSeeds(ref: DomainReference): DomainDefinition[] {
  const spellNames = domainSpellNames(ref._meta.book);
  const seeds = ref.raw.map((entry) => domainSeed(ref, entry));
  for (const seed of seeds) {
    for (const spell of seed.spells) spell.name = spellNames.get(spell.name.toLowerCase()) ?? spell.name;
  }
  return seeds;
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
    Wiz: "Wizard Spells",
    Sor: "Sorcerer Spells",
    Clr: "Cleric Spells",
    Brd: "Bard Spells",
    Drd: "Druid Spells",
    Pal: "Paladin Spells",
    Rgr: "Ranger Spells",
  };

  const dualMap: Record<string, string[]> = {
    "Sor/Wiz": ["Wizard Spells", "Sorcerer Spells"],
    "sorcerer/wizard": ["Wizard Spells", "Sorcerer Spells"],
  };

  // Auto-discover from class references (scoped to book if provided)
  if (existsSync(REFERENCE_DIR)) {
    for (const book of referenceBooks()) {
      // Discover casting classes
      for (const { ref } of classReferences(book)) {
        if (ref.mapping?.spells && ref.raw?.name) {
          const aptName = `${ref.raw.name} Spells`;
          classMap[ref.raw.name] = aptName;
          classMap[ref.raw.name.toLowerCase()] = aptName;
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
function getClassSpellMaps() {
  if (!_classSpellMaps) _classSpellMaps = buildClassSpellMaps();
  return _classSpellMaps;
}

/** Class name → aptitude name (auto-discovered from class references) */
function getClassAbbrevMap(): Record<string, string> {
  return getClassSpellMaps().classMap;
}

/** Combined class entries that map to multiple aptitudes */
function getDualClassMap(): Record<string, string[]> {
  return getClassSpellMaps().dualMap;
}

function simplifyRange(range: string): string {
  // Strip leaked "Area/Effect/Target:" labels from upstream parser glitches
  // (e.g. "Touch Area/Effect/Target: Animal touched" → "Touch")
  const stripped = range.replace(/\s+(Area|Effect|Target)\/.*$/i, "").trim();
  if (stripped.startsWith("Close")) return "Close";
  if (stripped.startsWith("Medium")) return "Medium";
  if (stripped.startsWith("Long")) return "Long";
  return stripped;
}

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
  return trimmed.split("-").map(capitalize).join("-");
}

function normalizeSpellResistance(value: string): string {
  // Lowercase the canonical "(harmless)" / "(harmless, object)" parenthetical
  return value.replace(/\(Harmless/g, "(harmless");
}

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
  return normalizeWs(sanitizeText(text)).replace(/(\d+)\s*\/\s*/g, "$1/"); // "1 round/ level" → "1 round/level"
}

/** The properties of `base`, those of `own` over them by type. */
function withOwnProperties(base: Property[], own: Property[]): Property[] {
  const ownTypes = new Set(own.map((property) => property.type));
  return [...base.filter((property) => !ownTypes.has(property.type)), ...own];
}

/** A weapon's enhancement bonus, as modifiers of the weapon holding it: its attack's and its damage's. */
function weaponEnhancementModifiers(description: string): Modifier[] {
  const enhancement = readWeaponEnhancement(description);
  if (!enhancement) return [];
  const bonus = (target: string, value: number): Modifier[] =>
    value ? [{ target, operator: "add", value: String(value), valueType: "number" }] : [];
  return [...bonus("weapon.tohit.magic", enhancement.attack), ...bonus("weapon.damage.magic", enhancement.damage)];
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

/** Insert an ordinal suffix before the parenthetical class suffix in a feat name. */
export function insertOrdinalInName(name: string, ordinal: string): string {
  const match = name.match(/^(.+?)(\s*\(.+\))$/);
  if (match) return `${match[1]} ${ordinal}${match[2]}`;
  return `${name} ${ordinal}`;
}

// ---------------------------------------------------------------------------
// Class reference → ClassSeed + FeatSeed[]
// ---------------------------------------------------------------------------

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

/** A class's spell slots: detected, with the overrides' fields over them. None when it has none (`noSpells` removes them). */
export function classSpells(ref: ClassReference) {
  const { spells } = ref.mapping;
  return spells && ref.overrides?.spells ? { ...spells, ...ref.overrides.spells } : spells;
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

/** The spell lists a class's slots go to (`spells.lists`), or its own, "<Class> Spells": none for a class without slots. */
export function classSpellLists(ref: ClassReference): string[] {
  const spells = classSpells(ref);
  if (!spells) return [];
  return spells.lists?.map((list) => list.name) ?? [`${ref.raw.name} Spells`];
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

/** A book's domains as it prints them (`reference/<book>/domains.json`; none for a book without), and their feat pools' feats. */
export function bookDomainSeeds(book: string): { seeds: DomainDefinition[]; poolFeats: FeatSeed[] } {
  const path = join(REFERENCE_DIR, book, "domains.json");
  if (!existsSync(path)) return { seeds: [], poolFeats: [] };
  const ref = loadReference(path, "domain");
  return { seeds: domainSeeds(ref), poolFeats: buildDomainFeatPoolSeeds(ref) };
}

/**
 * What a domains reference's lists lack, as generated: a spell neither the core rules nor the book has (the seed
 * leaves it out), a spell level from 1st to 9th without a spell, and a spell of the book whose level line puts it on
 * one of them at a level the list doesn't. An override of the domain's spells corrects them.
 */
export function domainSpellIssues(ref: DomainReference): { domain: string; text: string }[] {
  const spellNames = domainSpellNames(ref._meta.book);
  const spellsPath = join(REFERENCE_DIR, ref._meta.book, "spells.json");
  const bookSpells = existsSync(spellsPath) ? loadReference(spellsPath, "spell").raw : [];
  const issues: { domain: string; text: string }[] = [];
  for (const { name: domain, spells } of domainSeeds(ref)) {
    const has = (name: string, level: number) =>
      spells.some((spell) => spell.level === level && spell.name.toLowerCase() === name.toLowerCase());
    for (const spell of spells) {
      if (!spellNames.has(spell.name.toLowerCase())) {
        issues.push({ domain, text: `${spell.name} (level ${spell.level}) is no spell of the core rules or the book` });
      }
    }
    for (let level = 1; level <= 9; level++) {
      if (!spells.some((spell) => spell.level === level)) issues.push({ domain, text: `no spell at level ${level}` });
    }
    for (const spell of bookSpells) {
      for (const { className, level } of spell.levelEntries) {
        if (className === domain && !has(spell.name, level)) {
          issues.push({ domain, text: `the book's ${spell.name} is ${domain} ${level}, not on its list` });
        }
      }
    }
  }
  return issues;
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

// ---------------------------------------------------------------------------
// Wizard school reference → WizardSchoolDefinition[]
// ---------------------------------------------------------------------------

export function buildWizardSchoolSeeds(ref: WizardSchoolReference): WizardSchoolDefinition[] {
  return ref.raw.map((entry) => ({
    name: entry.name,
    description: ref.overrides?.[entry.name]?.description ?? entry.description,
    prohibitedSchoolCount: entry.prohibitedSchoolCount,
  }));
}

// ---------------------------------------------------------------------------
// Race reference → RaceDefinition[]
// ---------------------------------------------------------------------------

/** The races a race reference's overrides skip, which the seed leaves out. */
export function skippedRaces(ref: RaceReference): Set<string> {
  return new Set(ref.raw.filter(({ name }) => ref.overrides?.[name]?.skip).map(({ name }) => name));
}

/**
 * The races a race reference seeds (those its overrides don't skip), each with its override and its size, checked:
 * the override's, else as scraped. Generation throws a size's problem, and `parser:validate` reports it.
 */
export function seededRaces(ref: RaceReference) {
  const skipped = skippedRaces(ref);
  return ref.raw
    .filter(({ name }) => !skipped.has(name))
    .map((entry) => {
      const override = ref.overrides?.[entry.name];
      return {
        name: entry.name,
        entry,
        override,
        size: checkOneOf(override?.size ?? entry.size, SIZE_OPTIONS, `${entry.name}'s size`),
      };
    });
}

export function buildRaceSeeds(ref: RaceReference): RaceDefinition[] {
  return seededRaces(ref).map(({ entry, override, size }) => {
    const mapping = ref.mapping[entry.name];

    return {
      name: override?.name ?? entry.name,
      description: mapping?.description ?? entry.description,
      size: checkedValue(size),
      baseSpeed: override?.baseSpeed ?? entry.baseSpeed,
      ...(mapping?.modifiers?.length ? { modifiers: mapping.modifiers } : {}),
      ...(override?.properties?.length ? { properties: override.properties } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// Feat reference → FeatSeed[]
// ---------------------------------------------------------------------------

/** Build map of feat name → additional aptitudes from all class bonusFeatLists in a given book. */
export function loadBonusFeatAptitudes(book: string): Map<string, string[]> {
  const map = new Map<string, string[]>();

  function add(featName: string, aptitude: string) {
    const existing = map.get(featName) ?? [];
    if (!existing.includes(aptitude)) {
      existing.push(aptitude);
      map.set(featName, existing);
    }
  }

  for (const { ref } of classReferences(book)) {
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

  for (const { file, ref } of classReferences(book)) {
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

export function buildSpellSeeds(ref: SpellReference, book?: string): { spells: SpellSeedWithLevel[] } {
  // The lists other books' classes draw on others' lists for (`inheritsFrom`), which an extension's spell can be on:
  // the book seeds its own copy of each that takes one, which a ruleset merges with that book's when it takes both, as
  // it does a class list the spell's level line names. The core rules' spells reach them through each book's copies.
  const othersInherited =
    book && book !== "srd" ? referenceBooks().flatMap((other) => (other === book ? [] : inheritedLists(other))) : [];

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
    const hasMissing =
      !entry.range ||
      !entry.duration ||
      entry.components.length === 0 ||
      !entry.savingThrow ||
      !entry.spellResistance ||
      !entry.castingTime;
    if (hasMissing) {
      // Walk the "functions like" chain up to 3 levels deep
      let current: SpellReference["raw"][number] | undefined = entry;
      const visited = new Set<string>([entry.name]);
      for (let depth = 0; depth < 3 && current; depth++) {
        const baseMatch = current.description.match(
          /(?:functions? like|works like|functions? similarly to|[Ss]imilar to)\s+(.+?)(?:,|\.| except| but)/i,
        );
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
          ...(!entry.target && !entry.effect && !entry.area
            ? {
                target: base.target,
                effect: base.effect,
                area: base.area,
              }
            : {}),
          // Only inherit savingThrow/spellResistance if truly empty (not scraped)
          savingThrow: entry.savingThrow || base.savingThrow,
          spellResistance: entry.spellResistance || base.spellResistance,
        };
        // Continue walking if still missing fields
        const stillMissing =
          !entry.range ||
          !entry.duration ||
          entry.components.length === 0 ||
          !entry.savingThrow ||
          !entry.spellResistance ||
          !entry.castingTime;
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

    for (const { aptitude, list } of othersInherited) {
      if (aptitudes.has(aptitude)) continue;
      const level = inheritedLevel(entry, entry.levelEntries, list);
      if (level === undefined) continue;
      aptitudes.add(aptitude);
      aptitudeLevels[aptitude] = level;
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
    properties.push({ type: SPELL_SCHOOL, value: entry.school });
    if (entry.subschool) properties.push({ type: SPELL_SUBSCHOOL, value: normalizeSubschool(entry.subschool) });
    for (const desc of entry.descriptors) {
      properties.push({ type: SPELL_DESCRIPTOR, value: normalizeDescriptor(desc) });
    }
    properties.push({
      type: SPELL_CASTING_TIME,
      value: normalizeSpellText(entry.castingTime || "1 standard action"),
    });
    const rangeValue = simplifyRange(normalizeSpellText(entry.range));
    if (rangeValue) properties.push({ type: SPELL_RANGE_TYPE, value: rangeValue });
    const targetValue = entry.target ? normalizeSpellText(entry.target) : undefined;
    if (targetValue) properties.push({ type: SPELL_TARGET, value: targetValue });
    if (entry.area) properties.push({ type: SPELL_AREA_OF_EFFECT, value: normalizeSpellText(entry.area) });
    const effectValue = entry.effect ? normalizeSpellText(entry.effect) : undefined;
    if (effectValue && effectValue !== targetValue) properties.push({ type: SPELL_TARGET, value: effectValue });
    properties.push({ type: SPELL_DURATION, value: normalizeSpellText(entry.duration) });
    properties.push({
      type: SPELL_RESISTANCE,
      value: normalizeSpellResistance(normalizeSpellText(entry.spellResistance || "No")),
    });
    for (const compName of expandComponents(entry.components)) {
      properties.push({ type: SPELL_COMPONENT, value: compName });
    }

    const savingThrow = normalizeSpellText(entry.savingThrow || "None");
    // Only include aptitudeLevels when not all aptitudes share the same level
    const hasVaryingLevels = Object.values(aptitudeLevels).some((l) => l !== minLevel);
    const seed: SpellSeedWithLevel = {
      name: entry.name,
      description: normalizeDescription(ref.overrides?.[entry.name]?.description ?? entry.description),
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

// ---------------------------------------------------------------------------
// Aptitude collection
// ---------------------------------------------------------------------------

/** A book's aptitudes: its feats' (`feats`, and its classes'), its classes' and spell lists', its domains' feat pools. */
export function collectAptitudes(feats: Pick<FeatSeed, "name" | "aptitudes" | "modifiers">[], book: string): string[] {
  const names = new Set<string>();

  // Collect all feats: standalone feats + class feature feats from reference JSONs
  const allFeats: Pick<FeatSeed, "name" | "aptitudes" | "modifiers">[] = [...feats];
  for (const { ref } of classReferences(book)) {
    allFeats.push(...buildClassFeatSeeds(ref), ...classDomainPickFeats(ref));
    if (ref.mapping.classFeatureAptitude) names.add(ref.mapping.classFeatureAptitude);
    for (const list of classSpellLists(ref)) names.add(list);

    // From detected bonusFeatLists
    if (ref.detected?.bonusFeatLists) {
      for (const list of ref.detected.bonusFeatLists) names.add(list.aptitude);
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

  // Domain aptitudes: the book's domains, and their feat pools'
  const domains = bookDomainSeeds(book);
  if (domains.seeds.length > 0) names.add("Cleric Domain");
  for (const feat of domains.poolFeats) for (const apt of feat.aptitudes) names.add(apt);

  // Wizard school aptitudes
  const wsRefPath = join(REFERENCE_DIR, book, "wizardSchools.json");
  if (existsSync(wsRefPath)) {
    const wsRef = loadReference(wsRefPath, "wizardSchool");
    for (const school of buildWizardSchoolSeeds(wsRef)) {
      names.add(`${school.name} Specialist Spells`);
    }
  }

  // For extension books: collect aptitudes referenced by this book's spells
  // so we can keep sibling spell list aptitudes (each extension creates its own copy).
  const spellAptitudes = new Set<string>();
  if (book !== "srd") {
    const spellRefPath = join(REFERENCE_DIR, book, "spells.json");
    if (existsSync(spellRefPath)) {
      const spellRef = loadReference(spellRefPath, "spell");
      const { spells } = buildSpellSeeds(spellRef, book);
      for (const spell of spells) {
        for (const apt of spell.aptitudes) spellAptitudes.add(apt);
      }
    }
  }

  // Exclude aptitudes created by other books (class features + spell lists).
  // For sibling extension spell lists, keep them if this book's spells reference them.
  for (const other of referenceBooks()) {
    if (other === book) continue;
    const isSibling = other !== "srd" && book !== "srd";
    for (const { ref } of classReferences(other)) {
      if (ref.mapping.classFeatureAptitude) names.delete(ref.mapping.classFeatureAptitude);
      for (const spellApt of classSpellLists(ref)) {
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
// Item reference → ItemDef[]
// ---------------------------------------------------------------------------

export function buildItemSeeds(ref: ItemReference): ItemSeedSets {
  const simpleWeapons: ItemDef[] = [];
  const martialWeapons: ItemDef[] = [];
  const exoticWeapons: ItemDef[] = [];
  const armor: ItemDef[] = [];
  const shields: ItemDef[] = [];
  const goods: ItemDef[] = [];

  /** An item's cost, weight and description (its override's, else as detected), unless it's skipped. */
  const corrected = (srdName: string, det: { costGp: string; weight: string }) => {
    const override = ref.overrides?.[srdName];
    if (override?.skip) return undefined;
    return {
      costGp: override?.costGp ?? det.costGp,
      weight: override?.weight ?? det.weight,
      description: override?.description,
    };
  };

  // Build weapons
  for (const [srdName, det] of Object.entries(ref.detected.weapons)) {
    if (!det.generatorName) continue;
    const item = corrected(srdName, det);
    if (!item) continue;
    const { costGp, weight } = item;
    // Find the raw entry for category info
    const rawWeapon = ref.raw.weapons.find((w) => w.name === srdName);
    const category = rawWeapon?.category?.replace(/ Weapons?$/, "").toLowerCase() ?? "";
    const description =
      item.description ?? `A ${category ? `${category} ` : ""}${det.proficiency.toLowerCase()} weapon.`;

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
    const item = corrected(srdName, det);
    if (!item) continue;
    const { costGp, weight } = item;
    const categoryLabel = det.proficiencyCategory.replace(/ armor$/i, "");
    const description = item.description ?? `${det.type === "Shield" ? "A shield" : `${categoryLabel} armor`}.`;

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
    const item = corrected(name, det);
    if (!item) continue;

    goods.push({
      name,
      description: item.description ?? "",
      weight: item.weight,
      costGp: item.costGp,
      type: "Other",
      slot: "Other" as const,
      properties: [],
    });
  }

  return { simpleWeapons, martialWeapons, exoticWeapons, armor, shields, goods };
}

/**
 * The magic items a magic item reference seeds (those its overrides don't skip), each with its override and its slot,
 * checked when it has one: the override's, else as detected. Generation throws a slot's problem, and
 * `parser:validate` reports it.
 */
export function seededMagicItems(ref: MagicItemReference) {
  return Object.entries(ref.detected).flatMap(([name, det]) => {
    const override = ref.overrides?.[name];
    if (override?.skip) return [];
    const slot = override?.slot ?? det.slot;
    return [{ name, det, override, slot: slot ? checkOneOf(slot, LOCATION_OPTIONS, `${name}'s slot`) : undefined }];
  });
}

/**
 * The magic item seeds, by kind. A specific armor or shield takes the stats its text gives (`readArmorStats`) and its
 * enhancement bonus to AC, a specific weapon made from a base one its enhancement bonus to attack and damage
 * (`readWeaponEnhancement`); an item made from a base one weighs what its base does (`baseWeights`, by name) unless it
 * says otherwise.
 */
export function buildMagicItemSeeds(
  ref: MagicItemReference,
  baseWeights: Record<string, string> = {},
): MagicItemSeedSets {
  const magicArmor: ItemDef[] = [];
  const magicShields: ItemDef[] = [];
  const magicWeapons: ItemDef[] = [];
  const wondrousItems: ItemDef[] = [];
  const rings: ItemDef[] = [];
  const rods: ItemDef[] = [];
  const staffs: ItemDef[] = [];

  const categoryBuckets: Record<MagicItemCategory, ItemDef[]> = {
    specificArmor: magicArmor,
    specificShield: magicShields,
    specificWeapon: magicWeapons,
    wondrousItem: wondrousItems,
    ring: rings,
    rod: rods,
    staff: staffs,
  };

  for (const { name, det, override: ovr, slot } of seededMagicItems(ref)) {
    const costGp = ovr?.costGp ?? det.costGp;
    // Find the raw entry for description
    const rawEntry = ref.raw.find((r) => r.name === name);
    const baseItemRaw =
      ovr?.baseItem !== undefined
        ? ovr.baseItem
        : (det.baseItem ?? detectBaseItem(name, rawEntry?.description ?? "", det.category));
    const sourceItem = baseItemRaw ?? undefined;

    const description = normalizeDescription(ovr?.description ?? rawEntry?.description ?? "");
    const stats = ARMOR_CATEGORIES.has(det.category) ? readArmorStats(description) : undefined;
    const statedWeight = stats?.weight ?? (det.weight !== "0" ? det.weight : undefined);
    const weight = ovr?.weight ?? statedWeight ?? (sourceItem && baseWeights[sourceItem]) ?? det.weight;

    const aura = ovr?.aura ?? det.aura;
    const casterLevel = ovr?.casterLevel ?? det.casterLevel;
    const properties: Property[] = [];
    if (aura) properties.push({ type: MAGIC_AURA, value: aura });
    if (casterLevel) properties.push({ type: MAGIC_CASTER_LEVEL, value: String(casterLevel) });
    properties.push(...(stats?.properties ?? []));
    if (ovr?.properties) properties.push(...ovr.properties);
    // Its enhancement bonus: an armor's or a shield's to its part of the AC, a weapon's to its own attack and damage
    // (not ammunition's, made from no weapon, which no hand holds)
    const enhancement: Modifier[] = stats?.enhancement
      ? [
          {
            target: det.category === "specificArmor" ? "combat.ac.armor" : "combat.ac.shield",
            operator: "add",
            value: String(stats.enhancement),
            valueType: "number",
          },
        ]
      : det.category === "specificWeapon" && sourceItem
        ? weaponEnhancementModifiers(description)
        : [];
    // An override's modifiers, an empty list too, win over those detected
    const modifiers = ovr?.modifiers ?? [...(det.modifiers ?? []), ...enhancement];

    const bucket = categoryBuckets[det.category];
    if (!bucket) throw new Error(`${name}: the seed has no magic items of the category "${det.category}"`);

    const categoryWord = CATEGORY_PREFIX[det.category];
    let itemName = name;
    if (categoryWord) {
      // Normalize plural category in name: "Metamagic Rods" → "Metamagic Rod"
      itemName = itemName
        .replace(/\bRods\b/g, "Rod")
        .replace(/\bRings\b/g, "Ring")
        .replace(/\bStaffs\b/g, "Staff");
      if (!new RegExp(`\\b${categoryWord}\\b`, "i").test(itemName)) {
        itemName = `${categoryWord} of ${itemName}`;
      }
    }

    // A template is made from nothing: its base armor's properties are its own, under those it changes
    if (ovr?.template && (det.category !== "specificArmor" || !sourceItem)) {
      throw new Error(`${name}: only a specific armor made from a base armor can be a template`);
    }
    bucket.push({
      name: itemName,
      description,
      weight,
      costGp,
      type: det.itemType,
      slot: slot && checkedValue(slot),
      ...(ovr?.template && sourceItem
        ? { isTemplate: true as const, properties: withOwnProperties(armorProperties(sourceItem), properties) }
        : { properties, ...(sourceItem ? { sourceItem } : {}) }),
      ...(modifiers.length ? { modifiers } : {}),
    });
  }

  return { magicArmor, magicShields, magicWeapons, wondrousItems, rings, rods, staffs };
}
