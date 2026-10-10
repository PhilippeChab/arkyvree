import CategoryPaths from "@/engine/core/paths/CategoryPaths.ts";
import type { GetterOf, PathCategory } from "@/engine/core/paths/PathCategory.ts";
import PathTraverser, { type Components, type TraversePathResult } from "@/engine/core/paths/PathTraverser.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { type Dnd35Components } from "@/engine/rulesets/dnd3.5/model/CharacterComponents.ts";
import { getOperators } from "@/shared/customization/operators.ts";
import { deriveNameLabels, deriveSegmentLabels, isLeafOfKind, type TargetPath } from "@/shared/customization/target.ts";
import { isRecord } from "@/shared/isRecord.ts";
import { stripSeparators } from "@/shared/text.ts";
import { UNARMED_STRIKE } from "@/vocabulary/dnd3.5/combat.ts";
import { ARMOR_TYPE, SHIELD_TYPE, WEAPON_PROFICIENCY, WEAPON_TYPE } from "@/vocabulary/dnd3.5/properties/index.ts";

import type ArmorsComponent from "./ArmorsComponent.ts";
import type ShieldsComponent from "./ShieldsComponent.ts";
import WeaponPaths from "./WeaponPaths.ts";
import type WeaponsComponent from "./WeaponsComponent.ts";

const ARMOR_LABELS: Record<string, string> = {
  ac: "Armor Class",
  checkpenalty: "Check Penalty",
  spellfailure: "Spell Failure",
  maxdex: "Maximum Dexterity",
};

const NAVIGATABLE_ARMOR_PATHS = [
  { path: "ac.bonus", description: "Base AC bonus from armor", type: "number" as const },
  { path: "ac.misc", description: "Other bonuses to armor AC", type: "number" as const },
  { path: "ac.total", description: "Total AC from this armor", type: "number" as const, requirementOnly: true },
  { path: "checkpenalty", description: "Penalty to Str/Dex skill checks", type: "number" as const },
  { path: "spellfailure", description: "Arcane spell failure chance", type: "number" as const },
  { path: "maxdex", description: "Maximum Dexterity bonus to AC", type: "number" as const },
];

const NAVIGATABLE_SHIELD_PATHS = [
  { path: "ac.bonus", description: "Base AC bonus from shield", type: "number" as const },
  { path: "ac.misc", description: "Other bonuses to shield AC", type: "number" as const },
  { path: "ac.total", description: "Total AC from this shield", type: "number" as const, requirementOnly: true },
  { path: "checkpenalty", description: "Penalty to Str/Dex skill checks", type: "number" as const },
  { path: "spellfailure", description: "Arcane spell failure chance", type: "number" as const },
  { path: "maxdex", description: "Maximum Dexterity bonus to AC (a tower shield's)", type: "number" as const },
];

const SHIELD_LABELS: Record<string, string> = {
  ac: "Armor Class",
  checkpenalty: "Check Penalty",
  spellfailure: "Spell Failure",
  maxdex: "Maximum Dexterity",
};

/** The equipped items' target paths: items.weapons / items.armors / items.shields, a grouping's items. */
export default class ItemsPaths implements PathCategory<Dnd35Components> {
  static generateArmorPaths(armorGroupings: string[], kind: "modifier" | "requirement"): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const grouping of armorGroupings) {
      for (const subPath of NAVIGATABLE_ARMOR_PATHS) {
        if (!isLeafOfKind(subPath, kind)) continue;
        paths.push({
          path: `items.armors.${grouping}.${subPath.path}`,
          category: "items",
          description: subPath.description,
          valueType: subPath.type,
          operators: getOperators(subPath.type, kind),
        });
      }
    }

    return paths;
  }

  static generateShieldPaths(shieldGroupings: string[], kind: "modifier" | "requirement"): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const grouping of shieldGroupings) {
      for (const subPath of NAVIGATABLE_SHIELD_PATHS) {
        if (!isLeafOfKind(subPath, kind)) continue;
        paths.push({
          path: `items.shields.${grouping}.${subPath.path}`,
          category: "items",
          description: subPath.description,
          valueType: subPath.type,
          operators: getOperators(subPath.type, kind),
        });
      }
    }

    return paths;
  }

  static generateWeaponPaths(weaponGroupings: string[], kind: "modifier" | "requirement"): TargetPath[] {
    return weaponGroupings.flatMap((grouping) => WeaponPaths.buildPaths(`items.weapons.${grouping}`, "items", kind));
  }

  readonly description = "Equipped weapon, armor, and shield stats";

  readonly groupDescriptionTemplates = {
    "items.weapons": "{name} weapon stats",
    "items.armors": "{name} armor stats",
    "items.shields": "{name} shield stats",
  };

  readonly label = "Items";

  readonly name = "items";

  readonly namesEntities = true;

  readonly pathDescriptions = {
    "items.weapons": "Per-weapon attack, damage, critical, and how it's wielded",
    "items.armors": "Per-armor AC, check penalty, spell failure, and max dexterity",
    "items.shields": "Per-shield AC, check penalty, spell failure, and max dexterity",
    // Item sub-group intermediates (structural keys, dynamic group stripped)
    "items.weapons.tohit": "Attack roll bonuses",
    "items.weapons.damage": "Damage components",
    "items.weapons.damage.critical": "Critical hit range and multiplier",
    "items.armors.ac": "AC bonus and modifiers",
    "items.shields.ac": "AC bonus and modifiers",
  };

  generate(rulesetData: RulesetData, kind: "modifier" | "requirement"): TargetPath[] {
    const itemProperties = rulesetData.propertiesByEntityType.get("items") ?? [];
    // Every character strikes unarmed, without an item: its grouping is always there
    const weaponGroupings = [
      ...new Set([
        stripSeparators(UNARMED_STRIKE),
        ...CategoryPaths.collectPropertySlugs(itemProperties, WEAPON_TYPE),
        ...CategoryPaths.collectPropertySlugs(itemProperties, WEAPON_PROFICIENCY),
      ]),
    ];
    return [
      ...ItemsPaths.generateWeaponPaths(weaponGroupings, kind),
      ...ItemsPaths.generateArmorPaths(CategoryPaths.collectPropertySlugs(itemProperties, ARMOR_TYPE), kind),
      ...ItemsPaths.generateShieldPaths(CategoryPaths.collectPropertySlugs(itemProperties, SHIELD_TYPE), kind),
    ];
  }

  getSegmentLabels(): Record<string, string> {
    return {
      weapons: "Weapons",
      ...deriveSegmentLabels(NAVIGATABLE_ARMOR_PATHS, { armors: "Armors", ...ARMOR_LABELS }),
      ...deriveSegmentLabels(NAVIGATABLE_SHIELD_PATHS, { shields: "Shields", ...SHIELD_LABELS }),
    };
  }

  /**
   * The groupings an item is reached by, labeled by their names: its properties' values (a weapon's type, its
   * proficiency; a number, or no letter at all, names none: a number is a spell level's), and the unarmed strike,
   * which no item has.
   */
  labelNames(rulesetData: RulesetData) {
    const values = (rulesetData.propertiesByEntityType.get("items") ?? [])
      .map(({ value }) => value)
      .filter((value) => /[a-z]/.test(stripSeparators(value)));
    return { names: deriveNameLabels([UNARMED_STRIKE, ...values]) };
  }

  /** A grouping's equipped items. Null for another sub-category, or a path that names none. */
  resolve(
    target: string,
    rest: string[],
    components: Components,
    traverser: PathTraverser,
  ): TraversePathResult[] | null {
    if (rest.length === 0) return null;
    const [subcategory, grouping, ...subPath] = rest;
    if (subcategory !== "weapons" && subcategory !== "armors" && subcategory !== "shields") return null;
    const component = PathTraverser.findComponent(components, subcategory);
    if (!component) return PathTraverser.failed(null, target, `${subcategory} holder not found`);
    const pathParts = ["items", subcategory, stripSeparators(grouping)];

    if (subcategory === "weapons") {
      const groups = PathTraverser.readComponent(component, "getWeapons" satisfies GetterOf<WeaponsComponent>);
      const group = isRecord(groups) ? groups[stripSeparators(grouping)] : undefined;
      if (!isRecord(group)) return [];
      return Object.entries(group).flatMap(([key, weapon]) =>
        traverser.traverse(component, subPath, weapon, key, 0, pathParts),
      );
    }
    const getterMap = { armors: "getArmors", shields: "getShields" } as const satisfies {
      armors: GetterOf<ArmorsComponent>;
      shields: GetterOf<ShieldsComponent>;
    };
    const groups = PathTraverser.readComponent(component, getterMap[subcategory]);
    const group = isRecord(groups) ? groups[stripSeparators(grouping)] : undefined;
    if (!group) return [];
    return traverser.traverse(component, subPath, group, grouping, 0, pathParts);
  }
}
