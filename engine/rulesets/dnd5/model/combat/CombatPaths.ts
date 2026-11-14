import type { GetterOf, NamedSegment, PathCategory, PathContext } from "@/engine/core/paths/PathCategory.ts";
import PathTraverser, { type Components, type TraversePathResult } from "@/engine/core/paths/PathTraverser.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { type Dnd5Components } from "@/engine/rulesets/dnd5/model/CharacterComponents.ts";
import Dnd5View from "@/engine/rulesets/dnd5/view/Dnd5View.ts";
import { getOperators } from "@/shared/customization/operators.ts";
import {
  deriveSegmentLabels,
  isLeafOfKind,
  type OperatorKind,
  type TargetPath,
} from "@/shared/customization/target.ts";
import { isRecord } from "@/shared/isRecord.ts";
import { capitalize, stripSeparators } from "@/shared/text.ts";
import { WORN_ARMOR_CATEGORIES } from "@/vocabulary/dnd5/combat.ts";

import type CombatComponent from "./CombatComponent.ts";

/** The labels of the combat paths' segments their fields' descriptions don't give. */
const COMBAT_LABELS: Record<string, string> = {
  ac: "Armor Class",
  armortraining: "Armor Training",
  capacity: "Carrying Capacity",
  carriedweight: "Carried Weight",
  draglift: "Drag, Lift, or Push",
  hp: "Hit Points",
  proficiency: "Proficiency Bonus",
  sizesteps: "Size Steps",
  strengthmet: "Strength Met",
  twoweapon: "Two-Weapon Fighting",
  unarmored: "Unarmored Defense",
};

/**
 * The combat sheet's paths: a part computed when read (the Armor Class's base and Dexterity, the hit points'
 * Constitution, the totals, the Proficiency Bonus) is for requirements only, the flat bonus in the misc beside it.
 */
const COMBAT_PATHS = [
  // Armor Class
  {
    path: "ac.base",
    description: "10 and the best Unarmored Defense, or the armor's AC",
    type: "number" as const,
    sortOrder: 2,
    requirementOnly: true,
  },
  {
    path: "ac.dexterity",
    description: "Dexterity bonus to AC",
    type: "number" as const,
    sortOrder: 2,
    requirementOnly: true,
  },
  {
    path: "ac.shield",
    description: "Shield bonus to AC",
    type: "number" as const,
    sortOrder: 2,
  },
  {
    path: "ac.misc",
    description: "Other bonuses to AC",
    type: "number" as const,
    sortOrder: 2,
  },
  // What a feature's Armor Class or speed may require
  {
    path: "armor.category",
    description: "The category of the armor worn: none, light, medium or heavy",
    type: "string" as const,
    sortOrder: 2,
    requirementOnly: true,
    possibleValues: WORN_ARMOR_CATEGORIES.map((category) => ({ value: category, label: capitalize(category) })),
  },
  {
    path: "armor.trained",
    description: "Whether trained with the armor worn",
    type: "boolean" as const,
    sortOrder: 2,
    requirementOnly: true,
  },
  {
    path: "armor.strengthmet",
    description: "Whether Strength is high enough for the armor",
    type: "boolean" as const,
    sortOrder: 2,
    requirementOnly: true,
  },
  {
    path: "shield.held",
    description: "Whether a Shield is carried",
    type: "boolean" as const,
    sortOrder: 2,
    requirementOnly: true,
  },
  // Training: what a class's or a feat's Armor Training sets
  { path: "armortraining.light", description: "Training with Light armor", type: "boolean" as const },
  { path: "armortraining.medium", description: "Training with Medium armor", type: "boolean" as const },
  { path: "armortraining.heavy", description: "Training with Heavy armor", type: "boolean" as const },
  { path: "armortraining.shields", description: "Training with Shields", type: "boolean" as const },
  // Hit points
  { path: "hp.base", description: "From each level's hit points", type: "number" as const },
  { path: "hp.constitution", description: "Con modifier per level", type: "number" as const, requirementOnly: true },
  { path: "hp.misc", description: "Other bonuses to HP (Dwarven Toughness)", type: "number" as const },
  { path: "hp.total", description: "All HP sources combined", type: "number" as const, requirementOnly: true },
  // Initiative
  { path: "initiative.dexterity", description: "Dex modifier", type: "number" as const, requirementOnly: true },
  { path: "initiative.misc", description: "Other bonuses to initiative (Alert's)", type: "number" as const },
  {
    path: "initiative.total",
    description: "All initiative bonuses combined",
    type: "number" as const,
    requirementOnly: true,
  },
  // Attack
  // Proficiency Bonus
  {
    path: "proficiency.base",
    description: "By character level",
    type: "number" as const,
    requirementOnly: true,
  },
  {
    path: "proficiency.misc",
    description: "Other bonuses to it (Ioun Stone of Mastery)",
    type: "number" as const,
  },
  {
    path: "proficiency.total",
    description: "Proficiency Bonus",
    type: "number" as const,
    requirementOnly: true,
  },
  {
    path: "attacks",
    description: "Attacks per Attack action: the most a feature gives (Extra Attack)",
    type: "number" as const,
  },
  {
    path: "critical.range",
    description: "Critical hit range (1 = 20, 2 = 19–20)",
    type: "number" as const,
  },
  {
    path: "twoweapon.ability",
    description: "Ability modifier to off-hand damage (Two-Weapon Fighting)",
    type: "boolean" as const,
  },
  // Movement
  { path: "speed.base", description: "From the species (ft)", type: "number" as const },
  { path: "speed.misc", description: "Other bonuses to speed (ft)", type: "number" as const },
  { path: "speed.total", description: "Final speed (ft)", type: "number" as const, requirementOnly: true },
  // Carrying
  { path: "carrying.carriedweight", description: "Total weight of items (lbs)", type: "number" as const },
  {
    path: "carrying.capacity",
    description: "Carrying capacity (lbs)",
    type: "number" as const,
    requirementOnly: true,
  },
  {
    path: "carrying.draglift",
    description: "Drag, lift or push (lbs)",
    type: "number" as const,
    requirementOnly: true,
  },
  {
    path: "carrying.sizesteps",
    description: "Sizes larger it counts as for carrying capacity (Powerful Build)",
    type: "number" as const,
  },
  {
    path: "carrying.overloaded",
    description: "Whether over carrying capacity",
    type: "boolean" as const,
    requirementOnly: true,
  },
];

/** A weapon set's Armor Class's total, which reads the set's own shield. */
const SET_ARMOR_CLASS_PATHS = [
  { path: "total", description: "All AC bonuses combined", type: "number" as const, requirementOnly: true },
];

/**
 * The combat sheet's target paths (`combat.*`): its Armor Class, armor and training, hit points, initiative,
 * Proficiency Bonus, attacks, critical range, speed and carrying, and each weapon set's Armor Class.
 */
export default class CombatPaths implements PathCategory<Dnd5Components> {
  static generateCombatPaths(kind: OperatorKind): TargetPath[] {
    return COMBAT_PATHS.filter((path) => isLeafOfKind(path, kind)).map((path) => ({
      path: `combat.${path.path}`,
      category: "combat",
      description: path.description,
      valueType: path.type,
      operators: getOperators(path.type, kind),
      ...("sortOrder" in path && { sortOrder: path.sortOrder }),
      ...("possibleValues" in path && { possibleValues: path.possibleValues }),
    }));
  }

  static generateSetArmorClassPaths(kind: OperatorKind): TargetPath[] {
    return SET_ARMOR_CLASS_PATHS.filter((path) => isLeafOfKind(path, kind)).map((path) => ({
      path: `combat.weaponsets.*.ac.${path.path}`,
      category: "combat",
      description: path.description,
      valueType: path.type,
      operators: getOperators(path.type, kind),
      sortOrder: 2,
    }));
  }

  /**
   * Each ability's Unarmored Defense (`combat.ac.unarmored.<ability>`), a flag a modifier sets: an unarmored Armor
   * Class adds the best ability set, none when none is above 0. A modifier gated on the set (a monk's, no Shield held)
   * sets it in each set that meets it, as any modifier on the Armor Class (`Builds.scopesOf`).
   */
  static generateUnarmoredPaths(abilities: readonly { name: string }[], kind: OperatorKind): TargetPath[] {
    return abilities.map(({ name }) => ({
      path: `combat.ac.unarmored.${stripSeparators(name)}`,
      category: "combat",
      description: `${name} modifier added to AC without armor`,
      valueType: "boolean" as const,
      operators: getOperators("boolean", kind),
      sortOrder: 2,
    }));
  }

  static isArmorClassTarget(target: string): boolean {
    return target.startsWith("combat.ac.");
  }

  static isShieldBonusTarget(target: string): boolean {
    return target === "combat.ac.shield";
  }

  /** Whether a path reads a weapon set's own: its Armor Class or its shield, in a set's scope. */
  static readsWeaponSet(target: string): boolean {
    return CombatPaths.isArmorClassTarget(target) || target.startsWith("combat.shield.");
  }

  readonly component = { key: "combat", getter: "getCombat" } as const;

  readonly description = "AC, hit points, attacks, initiative, speed, armor and shield";

  readonly label = "Combat";

  readonly name = "combat";

  readonly pathDescriptions = {
    "combat.ac": "AC bonuses",
    "combat.armor": "The armor worn",
    "combat.armortraining": "Training with each armor category and with Shields",
    "combat.shield": "The Shield carried",
    "combat.hp": "HP sources and total",
    "combat.initiative": "Initiative bonus components",
    "combat.critical": "The rolls that score a critical hit",
    "combat.twoweapon": "Two-weapon fighting: the off-hand attack's damage",
    "combat.ac.unarmored": "The abilities AC adds without armor: the best counts",
    "combat.speed": "Speed (ft)",
    "combat.carrying": "Carried weight and carrying capacity",
    "combat.weaponsets": "Each weapon set's Armor Class",
    "combat.weaponsets.*": "Any weapon set",
  };

  /** Its unarmored Armor Class's paths name an ability (`nameSegments`). */
  readonly segmentKinds = ["abilities"] as const;

  generate(rulesetData: RulesetData, kind: OperatorKind): TargetPath[] {
    return [
      ...CombatPaths.generateCombatPaths(kind),
      ...CombatPaths.generateUnarmoredPaths(Dnd5View.of(rulesetData).abilities, kind),
      ...CombatPaths.generateSetArmorClassPaths(kind),
    ];
  }

  getSegmentLabels(): Record<string, string> {
    return {
      ...deriveSegmentLabels(COMBAT_PATHS, COMBAT_LABELS),
      ...deriveSegmentLabels(SET_ARMOR_CLASS_PATHS, COMBAT_LABELS),
    };
  }

  /** An ability's Unarmored Defense names the ability (`combat.ac.unarmored.<ability>`): no other path names one. */
  nameSegments(segments: readonly string[]): NamedSegment[] {
    const unarmored = segments.length === 4 && segments[1] === "ac" && segments[2] === "unarmored";
    return unarmored ? [{ entityType: "abilities", segment: 3 }] : [];
  }

  /**
   * In a weapon set's scope (a modifier on the Armor Class applied in each set, its own requirements read there:
   * `scopesOf`), the Armor Class and the shield are the set's own (`combat.ac.misc` its
   * `combat.weaponsets.<set>.ac.misc`). Null outside a scope, or for another path: the walk reads the sheet.
   */
  resolve(
    target: string,
    rest: string[],
    components: Components,
    traverser: PathTraverser,
    context?: PathContext,
  ): TraversePathResult[] | null {
    const [section, ...subPath] = rest;
    const scope = context?.scope;
    if (scope === undefined || !CombatPaths.readsWeaponSet(target)) return null;
    const component = PathTraverser.findComponent(components, this.component.key);
    if (!component) return [];
    const combat = PathTraverser.readComponent(component, "getCombat" satisfies GetterOf<CombatComponent>);
    if (!isRecord(combat) || !isRecord(combat.weaponsets)) return [];
    const weaponSet = combat.weaponsets[scope];
    if (!isRecord(weaponSet) || subPath.length === 0) return [];
    const pathParts = ["combat", "weaponsets", scope, section];
    return traverser.traverse(component, subPath, weaponSet[section], section, 0, pathParts);
  }
}
