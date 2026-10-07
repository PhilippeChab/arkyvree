import type { PathCategory } from "@/server/rulesets/engine/paths/PathCategory.ts";
import PathTraverser from "@/server/rulesets/engine/paths/PathTraverser.ts";
import { readHolder } from "@/server/rulesets/engine/paths/readHolder.ts";
import type { Holders, TraversePathResult } from "@/server/rulesets/engine/types.ts";
import { isRecord } from "@/shared/isRecord.ts";
import { stripSeparators } from "@/shared/text.ts";

/** The equipped items' target paths: items.weapons / items.armors / items.shields, a grouping's items. */
export default class ItemsPaths implements PathCategory {
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

  /** A grouping's equipped items. Null for another sub-category, or a path that names none. */
  resolve(target: string, rest: string[], holders: Holders, traverser: PathTraverser): TraversePathResult[] | null {
    if (rest.length === 0) return null;
    const [subcategory, grouping, ...subPath] = rest;
    if (subcategory !== "weapons" && subcategory !== "armors" && subcategory !== "shields") return null;
    const holder = holders[subcategory];
    if (!holder) return PathTraverser.failed(null, target, `${subcategory} holder not found`);
    const pathParts = ["items", subcategory, stripSeparators(grouping)];

    if (subcategory === "weapons") {
      const groups = readHolder(holder, "getWeapons");
      const group = isRecord(groups) ? groups[stripSeparators(grouping)] : undefined;
      if (!isRecord(group)) return [];
      return Object.entries(group).flatMap(([key, weapon]) =>
        traverser.traverse(holder, subPath, weapon, key, 0, pathParts),
      );
    }
    const getterMap = { armors: "getArmors", shields: "getShields" } as const;
    const groups = readHolder(holder, getterMap[subcategory]);
    const group = isRecord(groups) ? groups[stripSeparators(grouping)] : undefined;
    if (!group) return [];
    return traverser.traverse(holder, subPath, group, grouping, 0, pathParts);
  }
}
