import CategoryPaths from "@/engine/core/paths/CategoryPaths.ts";
import type { GetterOf, PathCategory } from "@/engine/core/paths/PathCategory.ts";
import PathTraverser, {
  type Component,
  type Components,
  type TraversePathResult,
} from "@/engine/core/paths/PathTraverser.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { type Dnd52Components } from "@/engine/rulesets/dnd5.2/model/CharacterComponents.ts";
import { getOperators } from "@/shared/customization/operators.ts";
import {
  deriveNameLabels,
  deriveSegmentLabels,
  isLeafOfKind,
  type OperatorKind,
  type TargetPath,
} from "@/shared/customization/target.ts";
import { isRecord } from "@/shared/isRecord.ts";
import { stripSeparators } from "@/shared/text.ts";
import { ARMOR_TYPE, WEAPON_CATEGORY, WEAPON_TYPE } from "@/vocabulary/dnd5.2/fields/index.ts";
import { UNARMED_STRIKE } from "@/vocabulary/dnd5.2/weapons.ts";

import type ArmorsComponent from "./ArmorsComponent.ts";
import type ShieldsComponent from "./ShieldsComponent.ts";
import WeaponPaths from "./WeaponPaths.ts";
import type WeaponsComponent from "./WeaponsComponent.ts";

/** Every weapon held, a weapons path's grouping: each once (`items.weapons.*.tohit.misc`). */
const ALL_WEAPONS = "*";

const ARMOR_LABELS: Record<string, string> = {
  ac: "Armor Class",
  maxdex: "Maximum Dexterity",
  stealthdisadvantage: "Stealth Disadvantage",
};

const NAVIGATABLE_ARMOR_PATHS = [
  { path: "ac.base", description: "The armor's own Armor Class", type: "number" as const },
  { path: "ac.misc", description: "Other bonuses to the armor's AC (a +1 armor's)", type: "number" as const },
  { path: "ac.total", description: "Total AC from this armor", type: "number" as const, requirementOnly: true },
  { path: "maxdex", description: "The most Dexterity modifier its wearer adds", type: "number" as const },
  { path: "strength", description: "The Strength its wearer needs, or its speed is lower", type: "number" as const },
  { path: "stealthdisadvantage", description: "Whether it hinders Stealth", type: "boolean" as const },
];

const NAVIGATABLE_SHIELD_PATHS = [
  { path: "ac.bonus", description: "The Shield's own bonus to AC", type: "number" as const },
  { path: "ac.misc", description: "Other bonuses to the Shield's AC (a +1 Shield's)", type: "number" as const },
  { path: "ac.total", description: "Total AC from this Shield", type: "number" as const, requirementOnly: true },
];

const SHIELD_LABELS: Record<string, string> = { ac: "Armor Class" };

/** The grouping every Shield is reached by (`items.shields.shield`): the SRD's Shields are of one kind. */
const SHIELDS = "shield";

/** The equipped items' target paths: items.weapons / items.armors / items.shields, a grouping's items. */
export default class ItemsPaths implements PathCategory<Dnd52Components> {
  /**
   * The weapons or the shields a group holds, by their key (a weapon's set and hand, a shield's entry): a shield type's
   * in every set, and every weapon held for `items.weapons.*`, once by its slot's key whichever groupings list it.
   */
  private static heldGroup(component: Component, subcategory: "shields" | "weapons", grouping: string): unknown {
    const groups =
      subcategory === "weapons"
        ? PathTraverser.readComponent(component, "getWeapons" satisfies GetterOf<WeaponsComponent>)
        : PathTraverser.readComponent(component, "getShields" satisfies GetterOf<ShieldsComponent>);
    if (!isRecord(groups)) return undefined;
    if (subcategory === "weapons" && grouping === ALL_WEAPONS)
      return Object.assign({}, ...Object.values(groups).filter(isRecord));
    return groups[stripSeparators(grouping)];
  }

  static generateArmorPaths(armorGroupings: string[], kind: OperatorKind): TargetPath[] {
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

  static generateShieldPaths(shieldGroupings: string[], kind: OperatorKind): TargetPath[] {
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

  /**
   * The weapons' paths by grouping, and a modifier's on every weapon held (`items.weapons.*`: each once, though it's
   * under its type and its proficiency both), which a requirement can't read: it reads one value.
   */
  static generateWeaponPaths(weaponGroupings: string[], kind: OperatorKind): TargetPath[] {
    const groupings = kind === "modifier" ? [...weaponGroupings, ALL_WEAPONS] : weaponGroupings;
    return groupings.flatMap((grouping) => WeaponPaths.buildPaths(`items.weapons.${grouping}`, "items", kind));
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
    "items.weapons": "Per-weapon proficiency, mastery, attack, damage, and how it's wielded",
    "items.armors": "Per-armor AC, max Dexterity, Strength and Stealth",
    "items.shields": "The Shield's AC",
    // Item sub-group intermediates (structural keys, dynamic group stripped)
    "items.weapons.tohit": "Attack roll bonuses",
    "items.weapons.damage": "Damage components",
    "items.armors.ac": "AC bonus and modifiers",
    "items.shields.ac": "AC bonus and modifiers",
  };

  generate(rulesetData: RulesetData, kind: OperatorKind): TargetPath[] {
    const itemValues = rulesetData.kindValues("items");
    // Every character strikes unarmed, without an item: its grouping is always there
    const weaponGroupings = [
      ...new Set([
        stripSeparators(UNARMED_STRIKE.name),
        ...CategoryPaths.collectValueSlugs(itemValues, WEAPON_TYPE),
        ...CategoryPaths.collectValueSlugs(itemValues, WEAPON_CATEGORY),
      ]),
    ];
    return [
      ...ItemsPaths.generateWeaponPaths(weaponGroupings, kind),
      ...ItemsPaths.generateArmorPaths(CategoryPaths.collectValueSlugs(itemValues, ARMOR_TYPE), kind),
      ...ItemsPaths.generateShieldPaths([SHIELDS], kind),
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
   * The groupings an item is reached by, labeled by their names: its fields' values (a weapon's type, its
   * proficiency; a number, or no letter at all, names none: a number is a spell level's), and the unarmed strike,
   * which no item has.
   */
  labelNames(rulesetData: RulesetData) {
    const values = rulesetData
      .kindValues("items")
      .map(({ value }) => value)
      .filter((value) => /[a-z]/.test(stripSeparators(value)));
    return { names: deriveNameLabels([UNARMED_STRIKE.name, "Shield", ...values]) };
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
    const pathParts = ["items", subcategory, grouping === ALL_WEAPONS ? grouping : stripSeparators(grouping)];

    if (subcategory === "armors") {
      const armors = PathTraverser.readComponent(component, "getArmors" satisfies GetterOf<ArmorsComponent>);
      const armor = isRecord(armors) ? armors[stripSeparators(grouping)] : undefined;
      if (!armor) return [];
      return traverser.traverse(component, subPath, armor, grouping, 0, pathParts);
    }
    // Each weapon or shield of the group, by its key
    const group = ItemsPaths.heldGroup(component, subcategory, grouping);
    if (!isRecord(group)) return [];
    return Object.entries(group).flatMap(([key, held]) =>
      traverser.traverse(component, subPath, held, key, 0, pathParts),
    );
  }
}
