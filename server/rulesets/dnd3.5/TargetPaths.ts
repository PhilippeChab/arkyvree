/** Import DetailedCharacter components that generate paths */

import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";
import { UNARMED_STRIKE } from "@/server/rulesets/constants.ts";
import DetailedCharacterArmors from "@/server/rulesets/dnd3.5/DetailedCharacterArmors.ts";
import DetailedCharacterCombat from "@/server/rulesets/dnd3.5/DetailedCharacterCombat.ts";
import DetailedCharacterEncumbrance from "@/server/rulesets/dnd3.5/DetailedCharacterEncumbrance.ts";
import DetailedCharacterShields from "@/server/rulesets/dnd3.5/DetailedCharacterShields.ts";
import DetailedCharacterSkills from "@/server/rulesets/dnd3.5/DetailedCharacterSkills.ts";
import DetailedCharacterWeapons, { WEAPON_PATH_ROOTS } from "@/server/rulesets/dnd3.5/DetailedCharacterWeapons.ts";
import type {
  Holder,
  Holders,
  TargetPathsInterface,
  TargetPathsTraverser,
  TraversePathResult,
} from "@/server/rulesets/types.ts";
import DetailedCharacterAbilities from "@/server/rulesets/universal/DetailedCharacterAbilities.ts";
import DetailedCharacterAptitudes from "@/server/rulesets/universal/DetailedCharacterAptitudes.ts";
import DetailedCharacterBonds from "@/server/rulesets/universal/DetailedCharacterBonds.ts";
import DetailedCharacterClasses from "@/server/rulesets/universal/DetailedCharacterClasses.ts";
import DetailedCharacterFeatGroupings from "@/server/rulesets/universal/DetailedCharacterFeatGroupings.ts";
import DetailedCharacterFeats from "@/server/rulesets/universal/DetailedCharacterFeats.ts";
import DetailedCharacterIdentity from "@/server/rulesets/universal/DetailedCharacterIdentity.ts";
import DetailedCharacterPowerGroupings from "@/server/rulesets/universal/DetailedCharacterPowerGroupings.ts";
import DetailedCharacterPowers from "@/server/rulesets/universal/DetailedCharacterPowers.ts";
import DetailedCharacterSavingThrows from "@/server/rulesets/universal/DetailedCharacterSavingThrows.ts";
import { isTraversable } from "@/server/rulesets/universal/isTraversable.ts";
import { readHolder } from "@/server/rulesets/universal/readHolder.ts";
import { formatPropertyType } from "@/shared/customization/properties.ts";
import type { TargetPath } from "@/shared/customization/target.ts";
import { FEAT_FAMILIES } from "@/shared/dnd3.5/feats.ts";
import {
  ARMOR_TYPE,
  FEAT_FAMILY,
  SHIELD_TYPE,
  SPELL_DESCRIPTOR,
  SPELL_SCHOOL,
  WEAPON_PROFICIENCY,
  WEAPON_TYPE,
} from "@/shared/dnd3.5/properties/index.ts";
import { toSpellPossessionSlug } from "@/shared/dnd3.5/spells.ts";
import { isRecord } from "@/shared/isRecord.ts";
import { stripSeparators } from "@/shared/text.ts";

import { Dnd35LevelsHooks } from "./hooks/index.ts";
import { collectClassListIds, collectFeatListIds } from "./spellcasting/spellLists.ts";

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  abilities: "Ability scores and modifiers",
  skills: "Skill ranks and modifiers",
  saves: "Fortitude, Reflex, and Will saving throws",
  combat: "AC, hit points, attack bonuses, initiative, speed, armor and shield",
  weapon: "On an item: its own weapon's to-hit, damage, and how it's wielded, wherever it's held",
  items: "Equipped weapon, armor, and shield stats",
  classes: "Class levels and bonus caster levels",
  feats: "Feat possession and stackable count",
  powers: "Spell DC, possession, and properties",
  identity: "Physiology, level, XP, and background",
  aptitudes: "Uses and selection slots",
  spellcasting: "Maximum arcane or divine spell level castable",
  bonded: "Familiar, animal companion, or mount race",
};

/** Each category's holder, and the getter that hands its data to a path. */
const CATEGORY_HOLDERS: Record<string, { holderKey: string; getter: string }> = {
  abilities: { holderKey: "abilities", getter: "getAbilities" },
  skills: { holderKey: "skills", getter: "getSkills" },
  saves: { holderKey: "savingThrows", getter: "getSavingThrows" },
  combat: { holderKey: "combat", getter: "getCombat" },
  classes: { holderKey: "classes", getter: "getClasses" },
  feats: { holderKey: "feats", getter: "getFeats" },
  powers: { holderKey: "powers", getter: "getPowers" },
  identity: { holderKey: "identity", getter: "getIdentity" },
  aptitudes: { holderKey: "aptitudes", getter: "getAptitudes" },
  spellcasting: { holderKey: "spellcasting", getter: "getSpellcasting" },
  bonded: { holderKey: "bonded", getter: "getBonds" },
};

const CATEGORY_LABELS: Record<string, string> = {
  abilities: "Abilities",
  skills: "Skills",
  saves: "Saving Throws",
  combat: "Combat",
  weapon: "Weapon",
  items: "Items",
  classes: "Classes",
  feats: "Feats",
  powers: "Spells",
  identity: "Identity",
  aptitudes: "Aptitudes",
  spellcasting: "Spellcasting",
  bonded: "Bonded",
};

/** The categories of the 3.5 rules' target paths (`getCategories`). */
const DND35_CATEGORIES = [
  "abilities",
  "skills",
  "saves",
  "combat",
  "weapon",
  "items",
  "classes",
  "feats",
  "powers",
  "identity",
  "aptitudes",
  "spellcasting",
  "bonded",
] as const;

/**
 * Template for entity-level descriptions (dynamic segments like ability/skill/class names). {name} is replaced with the
 * segment's display label.
 */
const GROUP_DESCRIPTION_TEMPLATES: Record<string, string> = {
  abilities: "{name} ability score and modifier",
  skills: "{name} skill rank and modifiers",
  saves: "{name} saving throw components",
  classes: "{name} class level and caster level",
  feats: "{name} feat possession",
  powers: "{name} spell DC and properties",
  aptitudes: "{name} uses and slots",
  "items.weapons": "{name} weapon stats",
  "items.armors": "{name} armor stats",
  "items.shields": "{name} shield stats",
};

const PATH_DESCRIPTIONS: Record<string, string> = {
  // Combat
  "combat.ac": "AC bonuses and totals",
  "combat.armor": "The armor worn",
  "combat.shield": "The shield carried",
  "combat.hp": "HP sources and total",
  "combat.initiative": "Initiative bonus components",
  "combat.grapple": "Grapple: BAB + Str + size",
  "combat.twoweapon": "Two-weapon fighting: each hand's penalty and the off hand's attacks",
  "combat.naturalattacks": "Natural attacks: the secondary ones' penalty, extra attacks, and their count",
  "combat.throwing": "Attacks with thrown weapons and slings",
  "combat.speed": "Movement speed (ft)",
  "combat.encumbrance": "Carry weight and load capacity",
  // An item's own weapon
  "weapon.tohit": "Attack roll bonuses of the item's own weapon",
  "weapon.damage": "Damage roll bonuses of the item's own weapon",
  "weapon.damage.critical": "Critical hit properties",
  // Items
  "items.weapons": "Per-weapon attack, damage, critical, and how it's wielded",
  "items.armors": "Per-armor AC, check penalty, spell failure, and max dexterity",
  "items.shields": "Per-shield AC, check penalty, and spell failure",
  // Item sub-group intermediates (structural keys, dynamic group stripped)
  "items.weapons.tohit": "Attack roll bonuses",
  "items.weapons.damage": "Damage components",
  "items.weapons.damage.critical": "Critical hit range and multiplier",
  "items.armors.ac": "AC bonus and modifiers",
  "items.shields.ac": "AC bonus and modifiers",
  // Identity
  "identity.physiology": "Character name, description, age, gender, height, weight",
  "identity.beliefs": "Deity and alignment",
  "identity.background": "Notes and private notes",
  "identity.meta": "Character level and experience points",
  "identity.physiology.race": "Character race name and size",
};

/** The distinct slugs of the properties' values of `type`. */
function slugsOf(properties: { type: string; value: string }[], type: string) {
  return [...new Set(properties.filter((p) => p.type === type).map((p) => stripSeparators(p.value)))];
}

/**
 * The groupings the ruleset's properties and powers define, which the paths are generated for: weapons by type
 * (e.g. "longsword") and proficiency category (e.g. "exotic"), each armor and shield type, spell schools and
 * descriptors (wildcard DC paths), each leveled power (flat DC paths), and feat families with their display names.
 */
function collectGroupings(rulesetData: CachedRulesetData) {
  const { powers, propertiesByEntityType } = rulesetData;
  const itemProperties = propertiesByEntityType.get("items") ?? [];
  const powerProperties = propertiesByEntityType.get("powers") ?? [];
  const featProperties = propertiesByEntityType.get("feats") ?? [];

  // Every family the rules know, a feat of the ruleset in it or not: an extension's checks of another book's
  const featGroupingLabels: Record<string, string> = Object.fromEntries(
    FEAT_FAMILIES.map((family) => [stripSeparators(family), family]),
  );
  for (const prop of featProperties) {
    if (prop.type === FEAT_FAMILY) featGroupingLabels[stripSeparators(prop.value)] = prop.value;
  }

  // The leveled aptitudes: those with spells at a level, and those a class gives slots in before they have any
  const leveledAptitudeIds = collectClassListIds(rulesetData);
  for (const power of powers) {
    for (const pa of power.powersAptitudesInRules) {
      if (pa.level != null) leveledAptitudeIds.add(pa.aptitudeId);
    }
  }

  return {
    powersWithProperties: powers.map((power) => ({
      ...power,
      properties: rulesetData.propertiesByEntity.get(power.id) ?? [],
    })),
    // Every character strikes unarmed, without an item: its grouping is always there
    weaponGroupings: [
      ...new Set([
        stripSeparators(UNARMED_STRIKE),
        ...slugsOf(itemProperties, WEAPON_TYPE),
        ...slugsOf(itemProperties, WEAPON_PROFICIENCY),
      ]),
    ],
    armorGroupings: slugsOf(itemProperties, ARMOR_TYPE),
    shieldGroupings: slugsOf(itemProperties, SHIELD_TYPE),
    schoolGroupings: slugsOf(powerProperties, SPELL_SCHOOL),
    descriptorGroupings: slugsOf(powerProperties, SPELL_DESCRIPTOR),
    individualPowerDcNames: [
      ...new Set(
        powers
          .filter((p) => p.powersAptitudesInRules.some((pa) => pa.level != null))
          .map((p) => stripSeparators(p.name)),
      ),
    ],
    featGroupings: Object.keys(featGroupingLabels),
    featGroupingLabels,
    leveledAptitudeIds,
  };
}

/** A path that reaches no value, with why. */
function failed(holder: Holder | null, key: string, error: string): TraversePathResult[] {
  return [{ holder, object: null, data: null, key, resolvedPath: null, error }];
}

/** Every target path, from the DetailedCharacter components' static generators, and the requirement-only spellcasting. */
function generatePaths(rulesetData: CachedRulesetData, kind: "modifier" | "requirement"): TargetPath[] {
  const { abilities, saves, skills, feats, aptitudes, klasses } = rulesetData;
  const groupings = collectGroupings(rulesetData);
  const paths: TargetPath[] = [
    ...DetailedCharacterSkills.generateTargetPaths(skills, kind),
    ...DetailedCharacterClasses.generateTargetPaths(klasses, kind),
    ...DetailedCharacterFeats.generateTargetPaths(feats, kind),
    ...DetailedCharacterFeatGroupings.generateTargetPaths(
      groupings.featGroupings,
      kind,
      groupings.featGroupingLabels,
      new Set(feats.map((feat) => stripSeparators(feat.name))),
    ),
    ...DetailedCharacterWeapons.generateTargetPaths(groupings.weaponGroupings, kind),
    ...DetailedCharacterArmors.generateTargetPaths(groupings.armorGroupings, kind),
    ...DetailedCharacterShields.generateTargetPaths(groupings.shieldGroupings, kind),
    ...DetailedCharacterPowers.generateTargetPaths(
      groupings.powersWithProperties,
      aptitudes,
      collectFeatListIds(rulesetData),
      kind,
    ),
    ...DetailedCharacterPowerGroupings.generateTargetPaths(groupings.schoolGroupings, kind, true, "school"),
    ...DetailedCharacterPowerGroupings.generateTargetPaths(groupings.descriptorGroupings, kind, true, "descriptor"),
    ...DetailedCharacterPowerGroupings.generateTargetPaths(groupings.individualPowerDcNames, kind, false),
    ...DetailedCharacterAptitudes.generateTargetPaths(
      aptitudes,
      kind,
      groupings.leveledAptitudeIds,
      Dnd35LevelsHooks.MAX_SPELL_LEVEL,
    ),
    ...DetailedCharacterCombat.generateTargetPaths(kind),
    ...DetailedCharacterWeapons.generateItemWeaponPaths(kind),
    ...DetailedCharacterEncumbrance.generateTargetPaths(kind),
    ...DetailedCharacterAbilities.generateTargetPaths(abilities, kind),
    ...DetailedCharacterSavingThrows.generateTargetPaths(saves, kind),
    ...DetailedCharacterIdentity.generateTargetPaths(kind),
    ...DetailedCharacterBonds.generateTargetPaths(kind),
  ];

  if (kind === "requirement") {
    const numericOps = [
      "equal",
      "not_equal",
      "greater_than",
      "less_than",
      "greater_than_or_equal",
      "less_than_or_equal",
    ];
    paths.push(
      {
        path: "spellcasting.arcane",
        category: "spellcasting",
        description: "Max arcane spell level castable",
        valueType: "number",
        operators: numericOps,
      },
      {
        path: "spellcasting.divine",
        category: "spellcasting",
        description: "Max divine spell level castable",
        valueType: "number",
        operators: numericOps,
      },
    );
  }
  return paths;
}

/** Each path segment's display label: the categories', the components' structural ones, and the ruleset's names. */
function segmentLabelsOf(rulesetData: CachedRulesetData): Record<string, string> {
  const { abilities, saves, skills, feats, items, aptitudes, klasses, powers, propertiesByEntityType } = rulesetData;
  const segmentLabels: Record<string, string> = {
    "*": "All",
    ...CATEGORY_LABELS,
    ...DetailedCharacterAbilities.getSegmentLabels(),
    ...DetailedCharacterSavingThrows.getSegmentLabels(),
    ...DetailedCharacterSkills.getSegmentLabels(),
    ...DetailedCharacterClasses.getSegmentLabels(),
    ...DetailedCharacterFeats.getSegmentLabels(),
    ...DetailedCharacterFeatGroupings.getSegmentLabels(),
    ...DetailedCharacterPowers.getSegmentLabels(),
    ...DetailedCharacterPowerGroupings.getSegmentLabels(),
    ...DetailedCharacterAptitudes.getSegmentLabels(),
    ...DetailedCharacterCombat.getSegmentLabels(),
    ...DetailedCharacterEncumbrance.getSegmentLabels(),
    ...DetailedCharacterWeapons.getSegmentLabels(),
    ...DetailedCharacterArmors.getSegmentLabels(),
    ...DetailedCharacterShields.getSegmentLabels(),
    ...DetailedCharacterIdentity.getSegmentLabels(),
    ...DetailedCharacterBonds.getSegmentLabels(),
    // D&D 3.5 surfaces power groupings as schools in the path picker.
    groups: "Schools",
  };

  for (const entity of [...abilities, ...saves, ...skills, ...feats, ...items, ...aptitudes, ...klasses, ...powers]) {
    segmentLabels[stripSeparators(entity.name)] = entity.name;
  }
  Object.assign(segmentLabels, DetailedCharacterSkills.getFamilyLabels(skills), {
    [stripSeparators(UNARMED_STRIKE)]: UNARMED_STRIKE,
  });

  // Spell possession slug labels (e.g. "wizard" → "Wizard" for "Wizard Spells" aptitude)
  for (const apt of aptitudes) {
    const slug = toSpellPossessionSlug(apt.name);
    if (!(slug in segmentLabels)) segmentLabels[slug] = apt.name.replace(/ Spells$/, "");
  }

  // Property values (weapon types, armor types, etc.)
  // Skip purely numeric values (e.g. ARMOR_CHECK_PENALTY "-1" → key "1") to avoid
  // clobbering spell level labels
  for (const prop of propertiesByEntityType.get("items") ?? []) {
    const normalized = stripSeparators(prop.value);
    if (normalized && !/^\d+$/.test(normalized)) segmentLabels[normalized] = prop.value;
  }

  // Every family the rules know, listed whether or not a feat of the ruleset is in it
  for (const family of FEAT_FAMILIES) segmentLabels[stripSeparators(family)] ??= family;

  // Feat property values (e.g. "weaponfocus" → "Weapon Focus")
  // For feat families, also add wildcard label (e.g. "weaponfocus*" → "Weapon Focus (Any)")
  for (const prop of propertiesByEntityType.get("feats") ?? []) {
    const normalizedValue = stripSeparators(prop.value);
    if (normalizedValue && !(normalizedValue in segmentLabels)) segmentLabels[normalizedValue] = prop.value;
    if (prop.type === FEAT_FAMILY && normalizedValue) {
      const wildcardKey = `${normalizedValue}*`;
      if (!(wildcardKey in segmentLabels)) segmentLabels[wildcardKey] = `${prop.value} (Any)`;
    }
  }

  // Power property type names (e.g. SPELL_SCHOOL → "Spell School")
  // and power property values (e.g. "evocation" → "Evocation")
  for (const prop of propertiesByEntityType.get("powers") ?? []) {
    if (!(prop.type in segmentLabels)) segmentLabels[prop.type] = formatPropertyType(prop.type);
    const normalizedValue = stripSeparators(prop.value);
    if (normalizedValue && !/^\d+$/.test(normalizedValue) && !(normalizedValue in segmentLabels)) {
      segmentLabels[normalizedValue] = prop.value;
    }
  }
  return segmentLabels;
}

/** The entries of `value` that are objects and whose slug starts with `slug` (but isn't it): a skill's subtypes. */
function subtypesOf(value: Record<string, unknown>, slug: string) {
  return Object.entries(value).filter(
    ([key, entry]) =>
      entry !== null &&
      typeof entry === "object" &&
      stripSeparators(key).startsWith(slug) &&
      stripSeparators(key) !== slug,
  );
}

export default class Dnd35TargetPaths implements TargetPathsInterface, TargetPathsTraverser {
  /** A category's data, from its holder's getter, traversed with the rest of the path. */
  private traverseCategory(target: string, category: string, rest: string[], holders: Holders): TraversePathResult[] {
    const mapping = CATEGORY_HOLDERS[category];
    if (!mapping) return failed(null, target, `Unknown category: ${category}`);
    const holder = holders[mapping.holderKey];
    if (!holder) return failed(null, target, `${CATEGORY_LABELS[category]} holder not found`);
    const data = readHolder(holder, mapping.getter);
    if (!data) return failed(holder, target, `${CATEGORY_LABELS[category]} not found`);
    return this.traversePath(holder, rest, data, category, 0, [category]);
  }

  /** Each of `entries` traversed with the rest of the path, under its own slug: a skill and its subtypes. */
  private traverseEach(
    holder: Holder,
    entries: [string, unknown][],
    rest: string[],
    maxDepth: number,
    pathParts: string[],
  ): TraversePathResult[] {
    return entries.flatMap(([key, value]) => {
      const slug = stripSeparators(key);
      return this.traversePath(holder, rest, value as Record<string, unknown>, slug, maxDepth, [...pathParts, slug]);
    });
  }

  /** items.weapons / items.armors / items.shields: a grouping's equipped items. Null for another sub-category. */
  private traverseItemGroup(target: string, rest: string[], holders: Holders): TraversePathResult[] | null {
    const [subcategory, grouping, ...subPath] = rest;
    if (subcategory !== "weapons" && subcategory !== "armors" && subcategory !== "shields") return null;
    const holder = holders[subcategory];
    if (!holder) return failed(null, target, `${subcategory} holder not found`);
    const pathParts = ["items", subcategory, stripSeparators(grouping)];

    if (subcategory === "weapons") {
      const groups = readHolder(holder, "getWeapons");
      const group = isRecord(groups) ? groups[stripSeparators(grouping)] : undefined;
      if (!isRecord(group)) return [];
      return Object.entries(group).flatMap(([key, weapon]) =>
        this.traversePath(holder, subPath, weapon, key, 0, pathParts),
      );
    }
    const getterMap = { armors: "getArmors", shields: "getShields" } as const;
    const groups = readHolder(holder, getterMap[subcategory]);
    const group = isRecord(groups) ? groups[stripSeparators(grouping)] : undefined;
    if (!group) return [];
    return this.traversePath(holder, subPath, group, grouping, 0, pathParts);
  }

  private traversePath(
    holder: Holder,
    elements: string[],
    currentValue: unknown,
    lastKey: string,
    maxDepth: number = 0,
    pathParts: string[] = [],
  ): TraversePathResult[] {
    if (maxDepth > 10) return failed(holder, lastKey, `Max depth reached`);
    maxDepth++;
    const [next, ...rest] = elements;
    if (next === "*" || next.endsWith("*")) {
      return this.traverseWildcard(holder, next, rest, currentValue, lastKey, maxDepth, pathParts);
    }

    const formattedKey = stripSeparators(next);
    // Only a skill's name also reaches its subtypes, the skills its name starts ("craft" → "craftarmorsmithing").
    // Anywhere else, a name another starts is another entry: a feat's ("dodge" isn't "dodgebonusswashbuckler",
    // "light" isn't "lightningreflexes"), checked by its family's group if it has one (`feats.weaponfocus.*`)
    const reachesSubtypes = rest.length > 0 && pathParts[0] === "skills";
    if (!formattedKey) return failed(holder, formattedKey, `Element not found: ${next}`);
    // A path that steps past a value (`abilities.strength.total.x`) fails whole, wildcard branches and all:
    // traversePathInit answers the throw with the path's one error.
    if (!isTraversable(currentValue)) throw new Error(`Element not found: ${next}`);
    if (!(formattedKey in currentValue)) {
      // A skill not found may name only its subtypes ("knowledge" for "knowledgearcana", "knowledgehistory"…):
      // expand to all of them like an implicit wildcard
      const prefixMatches = reachesSubtypes ? subtypesOf(currentValue, formattedKey) : [];
      if (prefixMatches.length === 0) return failed(holder, formattedKey, `Element not found: ${next}`);
      return this.traverseEach(holder, prefixMatches, rest, maxDepth, pathParts);
    }
    const subtypeMatches = reachesSubtypes ? subtypesOf(currentValue, formattedKey) : [];
    if (subtypeMatches.length > 0) {
      // The skill itself, then its subtypes.
      return this.traverseEach(
        holder,
        [[formattedKey, currentValue[formattedKey]], ...subtypeMatches],
        rest,
        maxDepth,
        pathParts,
      );
    }

    const path = [...pathParts, formattedKey];
    if (rest.length !== 0) {
      return this.traversePath(holder, rest, currentValue[formattedKey], formattedKey, maxDepth, path);
    }
    return [
      {
        holder,
        object: currentValue,
        data: currentValue[formattedKey],
        key: formattedKey,
        resolvedPath: path.join("."),
        error: null,
      },
    ];
  }

  /**
   * weapon.tohit.* / weapon.damage.* / weapon.wielded — an item's own weapon: the weapon slots holding its source, the
   * item (its modifiers), or one entry of it (a weapon's proficiency).
   */
  private traverseSourceWeapon(rest: string[], holders: Holders, sourceId: string | undefined): TraversePathResult[] {
    if (!sourceId) return [];
    const combatHolder = holders["combat"];
    if (!combatHolder) return [];
    const weaponsHolder = holders["weapons"];
    if (!weaponsHolder) return [];

    const combat = readHolder(combatHolder, "getCombat");
    if (!isRecord(combat) || !isRecord(combat.weaponsets)) return [];
    const results: TraversePathResult[] = [];
    for (const weaponSet of Object.values(combat.weaponsets)) {
      for (const [, weapon] of Object.entries(weaponSet as Record<string, unknown>)) {
        // Its item's (a modifier's source), or its entry's (a proficiency read of the entry holding it)
        const held = weapon as { itemId?: string | null; entryId?: string | null } | null;
        if (held && typeof held === "object" && (held.itemId === sourceId || held.entryId === sourceId)) {
          results.push(...this.traversePath(weaponsHolder, rest, weapon, rest[0], 0, ["weapon"]));
        }
      }
    }
    return results;
  }

  /**
   * A wildcard element (`*`, or `prefix*`): every object entry whose slug starts with the prefix, each traversed with
   * the rest of the path. A matched entry without the next element is a group: its children are tested with a
   * wildcard in turn. A wildcard can't end a path.
   */
  private traverseWildcard(
    holder: Holder,
    next: string,
    rest: string[],
    currentValue: unknown,
    lastKey: string,
    maxDepth: number,
    pathParts: string[],
  ): TraversePathResult[] {
    // A wildcard past nothing fails the path whole (as above); past a value, it matches nothing.
    if (currentValue === null || currentValue === undefined) throw new Error(`Element not found: ${next}`);
    if (!isTraversable(currentValue)) return [];
    const prefix = next === "*" ? "" : stripSeparators(next.slice(0, -1));
    const results: TraversePathResult[] = [];
    for (const [key, value] of Object.entries(currentValue)) {
      // Skip null values and non-object primitives
      if (value === null || typeof value !== "object") continue;
      const formattedKey = stripSeparators(key);
      if (!formattedKey || (prefix && !formattedKey.startsWith(prefix))) continue;
      if (rest.length === 0) return failed(holder, lastKey, `Wildcard modifier not supported as last element`);
      const nextElement = stripSeparators(rest[0]);
      // A value without the next path element is a group: recurse with a wildcard into its children.
      const elements = nextElement && !(nextElement in value) ? ["*", ...rest] : rest;
      results.push(...this.traversePath(holder, elements, value, key, maxDepth, [...pathParts, formattedKey]));
    }
    return results;
  }

  getCategories(): string[] {
    return [...DND35_CATEGORIES];
  }

  getCategoryDescriptions(): Record<string, string> {
    return { ...CATEGORY_DESCRIPTIONS };
  }

  getGroupDescriptionTemplates(): Record<string, string> {
    return { ...GROUP_DESCRIPTION_TEMPLATES };
  }

  getPathDescriptions(): Record<string, string> {
    return { ...PATH_DESCRIPTIONS };
  }

  /** Whether a target is an item's own weapon's (`weapon.tohit.misc`, `weapon.wielded`): the slots holding the item. */
  readsSource(target: string): boolean {
    const [category, sub] = target.split(".");
    return category === "weapon" && WEAPON_PATH_ROOTS.includes(sub);
  }

  /** A target's values: its category's data walked by the path (dot notation: category.item.property). */
  traversePathInit(target: string, holders: Holders, context?: { sourceId?: string }): TraversePathResult[] {
    try {
      const [category, ...rest] = target.split(".");
      if (this.readsSource(target)) return this.traverseSourceWeapon(rest, holders, context?.sourceId);
      if (category === "items" && rest.length > 0) {
        const items = this.traverseItemGroup(target, rest, holders);
        if (items) return items;
      }
      if (category === "skills" && rest[0] === "budget") {
        const holder = holders["skills"];
        if (!holder) return failed(null, target, "Skills holder not found");
        const budgetData = readHolder(holder, "getSkillBudget");
        return this.traversePath(holder, rest.slice(1), budgetData, "budget", 0, [category, "budget"]);
      }
      return this.traverseCategory(target, category, rest, holders);
    } catch (error) {
      return failed(null, target, `Failed to traverse path: ${error}`);
    }
  }

  async getTargetPathsAndLabels(
    rulesetData: CachedRulesetData,
    kind: "modifier" | "requirement",
  ): Promise<{ paths: TargetPath[]; segmentLabels: Record<string, string> }> {
    return { paths: generatePaths(rulesetData, kind), segmentLabels: segmentLabelsOf(rulesetData) };
  }
}
