import type { RulesetData } from "@/server/cache/rulesetCache/index.ts";
import type { Dnd35Components } from "@/server/rulesets/dnd3.5/character/components.ts";
import { UNARMED_STRIKE } from "@/server/rulesets/dnd3.5/constants.ts";
import type { GetterOf, PathCategory } from "@/server/rulesets/engine/paths/PathCategory.ts";
import PathTraverser from "@/server/rulesets/engine/paths/PathTraverser.ts";
import { collectPropertySlugs } from "@/server/rulesets/engine/paths/propertySlugs.ts";
import { readComponent } from "@/server/rulesets/engine/paths/readComponent.ts";
import type { Components, TraversePathResult } from "@/server/rulesets/engine/types.ts";
import { getNumericOperators } from "@/shared/customization/operators.ts";
import { deriveSegmentLabels, type TargetPath } from "@/shared/customization/target.ts";
import { ARMOR_TYPE, SHIELD_TYPE, WEAPON_PROFICIENCY, WEAPON_TYPE } from "@/shared/dnd3.5/properties/index.ts";
import { isRecord } from "@/shared/isRecord.ts";
import { stripSeparators } from "@/shared/text.ts";

import type ArmorsComponent from "./ArmorsComponent.ts";
import type ShieldsComponent from "./ShieldsComponent.ts";
import { buildWeaponPaths } from "./WeaponPaths.ts";
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
];

const SHIELD_LABELS: Record<string, string> = {
  ac: "Armor Class",
  checkpenalty: "Check Penalty",
  spellfailure: "Spell Failure",
};

/** The equipped items' target paths: items.weapons / items.armors / items.shields, a grouping's items. */
export default class ItemsPaths implements PathCategory<Dnd35Components> {
  static generateWeaponPaths(weaponGroupings: string[], kind: "modifier" | "requirement"): TargetPath[] {
    return weaponGroupings.flatMap((grouping) => buildWeaponPaths(`items.weapons.${grouping}`, "items", kind));
  }

  static generateArmorPaths(armorGroupings: string[], kind: "modifier" | "requirement"): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const grouping of armorGroupings) {
      for (const subPath of NAVIGATABLE_ARMOR_PATHS) {
        if ("requirementOnly" in subPath && subPath.requirementOnly && kind === "modifier") continue;
        paths.push({
          path: `items.armors.${grouping}.${subPath.path}`,
          category: "items",
          description: subPath.description,
          valueType: subPath.type,
          operators: getNumericOperators(kind),
        });
      }
    }

    return paths;
  }

  static generateShieldPaths(shieldGroupings: string[], kind: "modifier" | "requirement"): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const grouping of shieldGroupings) {
      for (const subPath of NAVIGATABLE_SHIELD_PATHS) {
        if ("requirementOnly" in subPath && subPath.requirementOnly && kind === "modifier") continue;
        paths.push({
          path: `items.shields.${grouping}.${subPath.path}`,
          category: "items",
          description: subPath.description,
          valueType: subPath.type,
          operators: getNumericOperators(kind),
        });
      }
    }

    return paths;
  }

  readonly name = "items";

  readonly label = "Items";

  readonly description = "Equipped weapon, armor, and shield stats";

  readonly groupDescriptionTemplates = {
    "items.weapons": "{name} weapon stats",
    "items.armors": "{name} armor stats",
    "items.shields": "{name} shield stats",
  };

  readonly pathDescriptions = {
    "items.weapons": "Per-weapon attack, damage, critical, and how it's wielded",
    "items.armors": "Per-armor AC, check penalty, spell failure, and max dexterity",
    "items.shields": "Per-shield AC, check penalty, and spell failure",
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
        ...collectPropertySlugs(itemProperties, WEAPON_TYPE),
        ...collectPropertySlugs(itemProperties, WEAPON_PROFICIENCY),
      ]),
    ];
    return [
      ...ItemsPaths.generateWeaponPaths(weaponGroupings, kind),
      ...ItemsPaths.generateArmorPaths(collectPropertySlugs(itemProperties, ARMOR_TYPE), kind),
      ...ItemsPaths.generateShieldPaths(collectPropertySlugs(itemProperties, SHIELD_TYPE), kind),
    ];
  }

  getSegmentLabels(): Record<string, string> {
    return {
      ...deriveSegmentLabels(NAVIGATABLE_ARMOR_PATHS, { armors: "Armors", ...ARMOR_LABELS }),
      ...deriveSegmentLabels(NAVIGATABLE_SHIELD_PATHS, { shields: "Shields", ...SHIELD_LABELS }),
    };
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
    const component = components[subcategory];
    if (!component) return PathTraverser.failed(null, target, `${subcategory} holder not found`);
    const pathParts = ["items", subcategory, stripSeparators(grouping)];

    if (subcategory === "weapons") {
      const groups = readComponent(component, "getWeapons" satisfies GetterOf<WeaponsComponent>);
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
    const groups = readComponent(component, getterMap[subcategory]);
    const group = isRecord(groups) ? groups[stripSeparators(grouping)] : undefined;
    if (!group) return [];
    return traverser.traverse(component, subPath, group, grouping, 0, pathParts);
  }
}
