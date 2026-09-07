import { ARMOR_TYPE, FEAT_FAMILY, SHIELD_TYPE, SPELL_DESCRIPTOR, SPELL_SCHOOL, WEAPON_PROFICIENCY, WEAPON_TYPE } from "@/server/rulesets/dnd3.5/properties/index.ts";
import type { CachedRulesetData } from "@/server/cache/rulesetCache.ts";
import type { TargetPathsInterface } from "@/server/rulesets/types.ts";
import type { Holder, Holders, TargetPathsTraverser, TraversePathResult } from "@/server/rulesets/types.ts";
import type { TargetPath } from "@/shared/customization/target.ts";
import { formatPropertyType, spellPossessionSlug, stripSeparators } from "@/shared/utils.ts";

// Import DetailedCharacter components that generate paths
import DetailedCharacterArmors from "@/server/rulesets/dnd3.5/DetailedCharacterArmors.ts";
import DetailedCharacterCombat from "@/server/rulesets/dnd3.5/DetailedCharacterCombat.ts";
import DetailedCharacterEncumbrance from "@/server/rulesets/dnd3.5/DetailedCharacterEncumbrance.ts";
import DetailedCharacterFeatGroupings from "@/server/rulesets/universal/DetailedCharacterFeatGroupings.ts";
import DetailedCharacterPowerGroupings from "@/server/rulesets/universal/DetailedCharacterPowerGroupings.ts";
import DetailedCharacterShields from "@/server/rulesets/dnd3.5/DetailedCharacterShields.ts";
import DetailedCharacterWeapons from "@/server/rulesets/dnd3.5/DetailedCharacterWeapons.ts";
import DetailedCharacterAbilities from "@/server/rulesets/universal/DetailedCharacterAbilities.ts";
import DetailedCharacterAptitudes from "@/server/rulesets/universal/DetailedCharacterAptitudes.ts";
import { Dnd35LevelsHooks } from "./hooks/LevelsHooks.ts";
import DetailedCharacterBonds from "@/server/rulesets/universal/DetailedCharacterBonds.ts";
import DetailedCharacterClasses from "@/server/rulesets/universal/DetailedCharacterClasses.ts";
import DetailedCharacterFeats from "@/server/rulesets/universal/DetailedCharacterFeats.ts";
import DetailedCharacterPowers from "@/server/rulesets/universal/DetailedCharacterPowers.ts";
import DetailedCharacterSavingThrows from "@/server/rulesets/universal/DetailedCharacterSavingThrows.ts";
import DetailedCharacterSkills from "@/server/rulesets/dnd3.5/DetailedCharacterSkills.ts";
import DetailedCharacterIdentity from "@/server/rulesets/universal/DetailedCharacterIdentity.ts";

// D&D 3.5 specific constants
const DND35_CATEGORIES = [
  "abilities",
  "skills",
  "saves",
  "combat",
  "items",
  "classes",
  "feats",
  "powers",
  "identity",
  "aptitudes",
  "spellcasting",
  "bonded",
] as const;

const PATH_DESCRIPTIONS: Record<string, string> = {
  // Combat
  "combat.tohit": "Attack roll bonuses for the equipped source weapon",
  "combat.damage": "Damage roll bonuses for the equipped source weapon",
  "combat.damage.critical": "Critical hit properties",
  "combat.ac": "AC bonuses and totals",
  "combat.hp": "HP sources and total",
  "combat.initiative": "Initiative bonus components",
  "combat.grapple": "Grapple: BAB + Str + size",
  "combat.speed": "Movement speed (ft)",
  "combat.encumbrance": "Carry weight and load capacity",
  // Items
  "items.weapons": "Per-weapon attack, damage, critical, and slot stats",
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

// Template for entity-level descriptions (dynamic segments like ability/skill/class names).
// {name} is replaced with the segment's display label.
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

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  abilities: "Ability scores and modifiers",
  skills: "Skill ranks and modifiers",
  saves: "Fortitude, Reflex, and Will saving throws",
  combat: "AC, hit points, attack bonuses, initiative, speed, and self-targeting weapon modifiers",
  items: "Equipped weapon, armor, and shield stats",
  classes: "Class levels and bonus caster levels",
  feats: "Feat possession and stackable count",
  powers: "Spell DC, possession, and properties",
  identity: "Physiology, level, XP, and background",
  aptitudes: "Uses and selection slots",
  spellcasting: "Maximum arcane or divine spell level castable",
  bonded: "Familiar, animal companion, or mount race",
};

const CATEGORY_LABELS: Record<string, string> = {
  abilities: "Abilities",
  skills: "Skills",
  saves: "Saving Throws",
  combat: "Combat",
  items: "Items",
  classes: "Classes",
  feats: "Feats",
  powers: "Spells",
  identity: "Identity",
  aptitudes: "Aptitudes",
  spellcasting: "Spellcasting",
  bonded: "Bonded",
};

export default class Dnd35TargetPaths implements TargetPathsInterface, TargetPathsTraverser {
  async getTargetPathsAndLabels(
    rulesetData: CachedRulesetData,
    kind: "modifier" | "requirement",
  ): Promise<{ paths: TargetPath[]; segmentLabels: Record<string, string> }> {
    const { abilities, saves, skills, feats, items, aptitudes, klasses, powers, propertiesByEntityType } = rulesetData;

    const itemProperties = propertiesByEntityType.get("items") ?? [];
    const powerProperties = propertiesByEntityType.get("powers") ?? [];
    const featProperties = propertiesByEntityType.get("feats") ?? [];

    // Build paths
    const powersWithProperties = powers.map((power) => ({
      ...power,
      properties: rulesetData.propertiesByEntity.get(power.id) ?? [],
    }));

    // Collect weapon groupings: by type (e.g. "longsword") and by proficiency category (e.g. "exotic")
    const weaponGroupings = [
      ...new Set([
        ...itemProperties
          .filter((p) => p.type === WEAPON_TYPE)
          .map((p) => stripSeparators(p.value)),
        ...itemProperties
          .filter((p) => p.type === WEAPON_PROFICIENCY)
          .map((p) => stripSeparators(p.value)),
      ]),
    ];

    // Collect armor type values for armor target paths (each armor type gets its own grouping)
    const armorGroupings = [
      ...new Set(
        itemProperties
          .filter((p) => p.type === ARMOR_TYPE)
          .map((p) => stripSeparators(p.value)),
      ),
    ];

    // Collect shield type values for shield target paths (each shield type gets its own grouping)
    const shieldGroupings = [
      ...new Set(
        itemProperties
          .filter((p) => p.type === SHIELD_TYPE)
          .map((p) => stripSeparators(p.value)),
      ),
    ];

    // Collect unique power grouping values for power DC target paths (wildcard paths)
    const schoolGroupings = [
      ...new Set(
        powerProperties
          .filter((p) => p.type === SPELL_SCHOOL)
          .map((p) => stripSeparators(p.value)),
      ),
    ];
    const descriptorGroupings = [
      ...new Set(
        powerProperties
          .filter((p) => p.type === SPELL_DESCRIPTOR)
          .map((p) => stripSeparators(p.value)),
      ),
    ];

    // Individual power DC target paths (flat paths, no wildcard)
    const individualPowerDcNames = [
      ...new Set(
        powers
          .filter((p) => p.powersAptitudesInRules.some((pa) => pa.level != null))
          .map((p) => stripSeparators(p.name)),
      ),
    ];

    // Collect unique feat family values for feat grouping target paths
    const featGroupings = [
      ...new Set(
        featProperties
          .filter((p) => p.type === FEAT_FAMILY)
          .map((p) => stripSeparators(p.value)),
      ),
    ];

    // Build slug→display-name map for feat groupings
    const featGroupingLabels: Record<string, string> = {};
    for (const prop of featProperties) {
      if (prop.type === FEAT_FAMILY) {
        featGroupingLabels[stripSeparators(prop.value)] = prop.value;
      }
    }

    // Detect leveled aptitudes from powers with non-null level on the junction table
    const leveledAptitudeIds = new Set<string>();
    for (const power of powers) {
      for (const pa of power.powersAptitudesInRules) {
        if (pa.level != null) {
          leveledAptitudeIds.add(pa.aptitudeId);
        }
      }
    }

    // Generate all paths using static methods from DetailedCharacter components
    const paths: TargetPath[] = [
      ...DetailedCharacterSkills.generateTargetPaths(skills, kind),
      ...DetailedCharacterClasses.generateTargetPaths(klasses, kind),
      ...DetailedCharacterFeats.generateTargetPaths(feats, kind),
      ...DetailedCharacterFeatGroupings.generateTargetPaths(featGroupings, kind, featGroupingLabels),
      ...DetailedCharacterWeapons.generateTargetPaths(weaponGroupings, kind),
      ...DetailedCharacterArmors.generateTargetPaths(armorGroupings, kind),
      ...DetailedCharacterShields.generateTargetPaths(shieldGroupings, kind),
      ...DetailedCharacterPowers.generateTargetPaths(powersWithProperties, aptitudes, kind),
      ...DetailedCharacterPowerGroupings.generateTargetPaths(schoolGroupings, kind, true, "school"),
      ...DetailedCharacterPowerGroupings.generateTargetPaths(descriptorGroupings, kind, true, "descriptor"),
      ...DetailedCharacterPowerGroupings.generateTargetPaths(individualPowerDcNames, kind, false),
      ...DetailedCharacterAptitudes.generateTargetPaths(aptitudes, kind, leveledAptitudeIds, Dnd35LevelsHooks.MAX_SPELL_LEVEL),
      ...DetailedCharacterCombat.generateTargetPaths(kind),
      ...DetailedCharacterEncumbrance.generateTargetPaths(kind),
      ...DetailedCharacterAbilities.generateTargetPaths(abilities, kind),
      ...DetailedCharacterSavingThrows.generateTargetPaths(saves, kind),
      ...DetailedCharacterIdentity.generateTargetPaths(kind),
      ...DetailedCharacterBonds.generateTargetPaths(kind),
    ];

    // Spellcasting paths (requirement-only)
    if (kind === "requirement") {
      const numericOps = ["equal", "not_equal", "greater_than", "less_than", "greater_than_or_equal", "less_than_or_equal"];
      paths.push(
        { path: "spellcasting.arcane", category: "spellcasting", description: "Max arcane spell level castable", valueType: "number", operators: numericOps },
        { path: "spellcasting.divine", category: "spellcasting", description: "Max divine spell level castable", valueType: "number", operators: numericOps },
      );
    }

    // Build segment labels
    const segmentLabels: Record<string, string> = {
      "*": "All",
      // Category labels
      ...CATEGORY_LABELS,
      // Structural segment labels from each DetailedCharacter class
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

    // Entity labels from DB
    for (const entity of [...abilities, ...saves, ...skills, ...feats, ...items, ...aptitudes, ...klasses, ...powers]) {
      segmentLabels[stripSeparators(entity.name)] = entity.name;
    }

    // Spell possession slug labels (e.g. "wizard" → "Wizard" for "Wizard Spells" aptitude)
    for (const apt of aptitudes) {
      const slug = spellPossessionSlug(apt.name);
      if (!(slug in segmentLabels)) {
        segmentLabels[slug] = apt.name.replace(/ Spells$/, "");
      }
    }

    // Property values (weapon types, armor types, etc.)
    // Skip purely numeric values (e.g. ARMOR_CHECK_PENALTY "-1" → key "1") to avoid
    // clobbering spell level labels
    for (const prop of itemProperties) {
      const normalized = stripSeparators(prop.value);
      if (normalized && !/^\d+$/.test(normalized)) {
        segmentLabels[normalized] = prop.value;
      }
    }

    // Feat property values (e.g. "weaponfocus" → "Weapon Focus")
    // For feat families, also add wildcard label (e.g. "weaponfocus*" → "Weapon Focus (Any)")
    for (const prop of featProperties) {
      const normalizedValue = stripSeparators(prop.value);
      if (normalizedValue && !(normalizedValue in segmentLabels)) {
        segmentLabels[normalizedValue] = prop.value;
      }
      if (prop.type === FEAT_FAMILY && normalizedValue) {
        const wildcardKey = `${normalizedValue}*`;
        if (!(wildcardKey in segmentLabels)) {
          segmentLabels[wildcardKey] = `${prop.value} (Any)`;
        }
      }
    }

    // Power property type names (e.g. SPELL_SCHOOL → "Spell School")
    // and power property values (e.g. "evocation" → "Evocation")
    for (const prop of powerProperties) {
      if (!(prop.type in segmentLabels)) {
        segmentLabels[prop.type] = formatPropertyType(prop.type);
      }
      const normalizedValue = stripSeparators(prop.value);
      if (normalizedValue && !/^\d+$/.test(normalizedValue) && !(normalizedValue in segmentLabels)) {
        segmentLabels[normalizedValue] = prop.value;
      }
    }

    return { paths, segmentLabels };
  }

  getCategories(): string[] {
    return [...DND35_CATEGORIES];
  }

  getCategoryDescriptions(): Record<string, string> {
    return { ...CATEGORY_DESCRIPTIONS };
  }

  getPathDescriptions(): Record<string, string> {
    return { ...PATH_DESCRIPTIONS };
  }

  getGroupDescriptionTemplates(): Record<string, string> {
    return { ...GROUP_DESCRIPTION_TEMPLATES };
  }

  traversePathInit(target: string, holders: Holders, context?: { sourceId?: string }): TraversePathResult[] {
    try {
      // Handle dot notation: category.item.property
      const parts = target.split(".");
      const [category, ...rest] = parts;

      let holder: Holder | null = null;
      let data = undefined;

      // Special case: combat.tohit.* / combat.damage.* etc. — self-targeting weapon modifier
      // Resolves to the specific weapon slot(s) occupied by the modifier's source item
      const WEAPON_SUB_PATHS = ["tohit", "damage", "strmultiplier"] as const;
      if (category === "combat" && rest.length > 0 && WEAPON_SUB_PATHS.includes(rest[0] as typeof WEAPON_SUB_PATHS[number])) {
        const sourceId = context?.sourceId;
        if (!sourceId) return [];

        const combatHolder = holders["combat"];
        if (!combatHolder) return [];

        const weaponsHolder = holders["weapons"];
        if (!weaponsHolder) return [];

        const combat = combatHolder.getCombat();
        const results: TraversePathResult[] = [];

        for (const weaponSet of Object.values(combat.weaponsets)) {
          for (const [, weapon] of Object.entries(weaponSet as Record<string, unknown>)) {
            if (weapon && typeof weapon === "object" && "itemId" in weapon && (weapon as { itemId: string | null }).itemId === sourceId) {
              results.push(...this.traversePath(weaponsHolder, rest, weapon, weapon, rest[0], 0, [category]));
            }
          }
        }

        return results;
      }

      // Special case: items.weapons / items.armors / items.shields sub-groups
      if (category === "items" && rest.length > 0) {
        const subcategory = rest[0] as "weapons" | "armors" | "shields";

        if (subcategory === "weapons") {
          holder = holders["weapons"];
          if (!holder) {
            return [{
              holder: null, object: null, data: null, key: target, resolvedPath: null,
              error: `${subcategory} holder not found`,
            }];
          }

          const [, grouping, ...subPath] = rest;
          const groupData = holder.getWeapons();
          const group = groupData[stripSeparators(grouping)];
          if (!group) return [];

          const results: TraversePathResult[] = [];
          for (const [key, weapon] of Object.entries(group)) {
            results.push(...this.traversePath(holder, subPath, weapon, weapon, key, 0, [category, subcategory, stripSeparators(grouping)]));
          }
          return results;
        }

        if (subcategory === "armors" || subcategory === "shields") {
          const holderKey = subcategory;
          holder = holders[holderKey];
          if (!holder) {
            return [{
              holder: null, object: null, data: null, key: target, resolvedPath: null,
              error: `${subcategory} holder not found`,
            }];
          }

          const getterMap = { armors: "getArmors", shields: "getShields" } as const;
          const [, grouping, ...subPath] = rest;
          const groupData = holder[getterMap[subcategory]]();
          const group = groupData[stripSeparators(grouping)];
          if (!group) return [];

          return this.traversePath(holder, subPath, group, group, grouping, 0, [category, subcategory, stripSeparators(grouping)]);
        }
      }

      // Special case: skills.budget sub-path
      if (category === "skills" && rest.length > 0 && rest[0] === "budget") {
        holder = holders["skills"];
        if (!holder) {
          return [{ holder: null, object: null, data: null, key: target, resolvedPath: null, error: "Skills holder not found" }];
        }
        const budgetData = holder.getSkillBudget();
        const [, ...subPath] = rest;
        return this.traversePath(holder, subPath, budgetData, budgetData, "budget", 0, [category, "budget"]);
      }

      // Map category names to holder keys and getter methods
      const categoryMap: Record<string, { holderKey: string; getter: string }> = {
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

      const mapping = categoryMap[category];
      if (!mapping) {
        return [{
          holder,
          object: null,
          data: null,
          key: target,
          resolvedPath: null,
          error: `Unknown category: ${category}`,
        }];
      }

      holder = holders[mapping.holderKey];
      if (!holder) {
        return [{
          holder: null,
          object: null,
          data: null,
          key: target,
          resolvedPath: null,
          error: `${CATEGORY_LABELS[category]} holder not found`,
        }];
      }

      const getterFn = holder[mapping.getter];
      if (typeof getterFn === "function") {
        data = holder[mapping.getter]();
      }

      if (!data) {
        return [{
          holder,
          object: null,
          data: null,
          key: target,
          resolvedPath: null,
          error: `${CATEGORY_LABELS[category]} not found`,
        }];
      }

      if (data) {
        return this.traversePath(holder, rest, data, data, category, 0, [category]);
      }

      return [{
        holder,
        object: null,
        data: null,
        key: target,
        resolvedPath: null,
        error: `Data not found`,
      }];
    } catch (error) {
      return [{
        holder: null,
        object: null,
        data: null,
        key: target,
        resolvedPath: null,
        error: `Failed to traverse path: ${error}`,
      }];
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private traversePath(holder: Holder, elements: string[], currentValue: any, parentObject: any, lastKey: string, maxDepth: number = 0, pathParts: string[] = []): TraversePathResult[] {
    if (maxDepth > 10) {
      return [{
        holder,
        object: null,
        data: null,
        key: lastKey,
        resolvedPath: null,
        error: `Max depth reached`,
      }];
    }

    maxDepth++;
    const [next, ...rest] = elements;

    if (next === "*" || next.endsWith("*")) {
      const prefix = next === "*" ? "" : stripSeparators(next.slice(0, -1));
      const entries = Object.entries(currentValue);
      const results: TraversePathResult[] = [];
      for (const [key, value] of entries) {
        // Skip null values and non-object primitives
        if (value === null || typeof value !== "object") {
          continue;
        }
        const formattedKey = stripSeparators(key);
        if (formattedKey && (!prefix || formattedKey.startsWith(prefix))) {
          if (rest.length === 0) {
            return [{
              holder,
              object: null,
              data: null,
              key: lastKey,
              resolvedPath: null,
              error: `Wildcard modifier not supported as last element`,
            }];
          } else {
            // If there are more elements, recursively process them.
            // If the matched value is a group (nested object without the next path element),
            // expand into its children with a wildcard so each child is tested.
            const nextElement = stripSeparators(rest[0]);
            if (nextElement && !(nextElement in value)) {
              // Value doesn't have the next path element directly — treat it as a group
              // and recurse with a wildcard into its children
              results.push(...this.traversePath(holder, ["*", ...rest], value, currentValue, key, maxDepth, [...pathParts, formattedKey]));
            } else {
              results.push(...this.traversePath(holder, rest, value, currentValue, key, maxDepth, [...pathParts, formattedKey]));
            }
          }
        }
      }

      return results;
    }

    const formattedKey = stripSeparators(next);
    if (formattedKey && formattedKey in currentValue) {
      // Sibling subtype expansion (`craft` → `craftarmorsmithing`). Skipped
      // for aptitudes — those are flat siblings, prefix overlap is not parent/child.
      const skipSubtypeExpansion = pathParts[0] === "aptitudes";
      if (rest.length > 0 && !skipSubtypeExpansion) {
        const subtypeMatches = Object.entries(currentValue).filter(([key, value]) =>
          value !== null && typeof value === "object" && stripSeparators(key).startsWith(formattedKey) && stripSeparators(key) !== formattedKey
        );
        if (subtypeMatches.length > 0) {
          const results: TraversePathResult[] = [];
          // Include exact match
          results.push(...this.traversePath(holder, rest, currentValue[formattedKey] as Record<string, unknown>, currentValue, formattedKey, maxDepth, [...pathParts, formattedKey]));
          // Include subtype matches
          for (const [key, value] of subtypeMatches) {
            const subtypeKey = stripSeparators(key);
            results.push(...this.traversePath(holder, rest, value as Record<string, unknown>, currentValue, subtypeKey, maxDepth, [...pathParts, subtypeKey]));
          }
          return results;
        }
      }
      parentObject = currentValue;
      lastKey = formattedKey;
      currentValue = parentObject[formattedKey];
      pathParts = [...pathParts, formattedKey];
      elements = rest;
    } else if (formattedKey && rest.length > 0) {
      // Key not found — check if it's a prefix of other keys (e.g., "craft" matches "craftarmorsmithing")
      // If so, expand to all matching keys like an implicit wildcard
      const prefixMatches = Object.entries(currentValue).filter(([key, value]) =>
        value !== null && typeof value === "object" && stripSeparators(key).startsWith(formattedKey) && stripSeparators(key) !== formattedKey
      );
      if (prefixMatches.length > 0) {
        const results: TraversePathResult[] = [];
        for (const [key, value] of prefixMatches) {
          const prefixKey = stripSeparators(key);
          results.push(...this.traversePath(holder, rest, value as Record<string, unknown>, currentValue, prefixKey, maxDepth, [...pathParts, prefixKey]));
        }
        return results;
      }
      return [{
        holder,
        object: null,
        data: null,
        key: formattedKey,
        resolvedPath: null,
        error: `Element not found: ${next}`,
      }];
    } else {
      return [{
        holder,
        object: null,
        data: null,
        key: formattedKey,
        resolvedPath: null,
        error: `Element not found: ${next}`,
      }];
    }

    if (elements.length !== 0) {
      return this.traversePath(
        holder,
        elements,
        currentValue,
        parentObject,
        lastKey,
        maxDepth,
        pathParts,
      );
    }

    return [{
      holder,
      object: parentObject,
      data: currentValue,
      key: lastKey,
      resolvedPath: pathParts.join("."),
      error: null,
    }];
  }
}
