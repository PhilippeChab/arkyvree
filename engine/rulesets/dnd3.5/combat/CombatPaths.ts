import type { PathCategory } from "@/engine/core/paths/PathCategory.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import type { Dnd35Components } from "@/engine/rulesets/dnd3.5/character/components.ts";
import { LOAD_CATEGORIES } from "@/engine/rulesets/dnd3.5/constants.ts";
import { getNumericOperators } from "@/shared/customization/operators.ts";
import { deriveSegmentLabels, type TargetPath } from "@/shared/customization/target.ts";
import { capitalize } from "@/shared/text.ts";

import { ARMOR_CATEGORIES } from "./CombatState.ts";

const COMBAT_LABELS: Record<string, string> = {
  tohit: "To Hit",
  ac: "Armor Class",
  hp: "Hit Points",
  bab: "Base Attack Bonus",
  grapple: "Grapple",
  twoweapon: "Two-Weapon Fighting",
  mainhandpenalty: "Main-Hand Penalty",
  offhandpenalty: "Off-Hand Penalty",
  offhandattacks: "Off-Hand Attacks",
  naturalattacks: "Natural Attacks",
  secondarypenalty: "Secondary Penalty",
  extraattacks: "Extra Attacks",
};

const COMBAT_PATHS = [
  // Armor class
  { path: "ac.base", description: "Default 10", type: "number" as const, sortOrder: 2 },
  {
    path: "ac.armor",
    description: "Armor bonus to AC: armor, bracers, an armor's enhancement (not in touch AC)",
    type: "number" as const,
    sortOrder: 2,
  },
  {
    path: "ac.shield",
    description: "Shield bonus to AC: a shield, its enhancement (not in touch AC)",
    type: "number" as const,
    sortOrder: 2,
  },
  {
    path: "ac.dexterity",
    description: "Dexterity bonus to AC",
    type: "number" as const,
    sortOrder: 2,
    requirementOnly: true,
  },
  { path: "ac.natural", description: "Natural armor bonus (not in touch AC)", type: "number" as const, sortOrder: 2 },
  { path: "ac.deflection", description: "Deflection bonus to AC", type: "number" as const, sortOrder: 2 },
  {
    path: "ac.dodge",
    description: "Dodge bonus to AC, and any other lost when flat-footed (not in flat-footed AC)",
    type: "number" as const,
    sortOrder: 2,
  },
  { path: "ac.size", description: "Size modifier to AC", type: "number" as const, sortOrder: 2, requirementOnly: true },
  {
    path: "ac.misc",
    description: "Other bonuses to AC, kept in touch and flat-footed AC (a monk's Wisdom)",
    type: "number" as const,
    sortOrder: 2,
  },
  {
    path: "ac.uncannydodge",
    description: "Keeps the Dexterity and dodge bonuses when flat-footed (uncanny dodge)",
    type: "boolean" as const,
    sortOrder: 2,
  },
  {
    path: "ac.total",
    description: "All AC bonuses combined",
    type: "number" as const,
    sortOrder: 2,
    requirementOnly: true,
  },
  {
    path: "ac.touch",
    description: "Ignores armor, shield, natural",
    type: "number" as const,
    sortOrder: 2,
    requirementOnly: true,
  },
  {
    path: "ac.flatfooted",
    description: "Ignores the Dexterity and dodge bonuses, unless uncanny dodge",
    type: "number" as const,
    sortOrder: 2,
    requirementOnly: true,
  },
  // What a class feature's speed or AC bonus may require
  {
    path: "armor.category",
    description: "The category of the heaviest armor worn: none, light, medium or heavy",
    type: "string" as const,
    sortOrder: 2,
    requirementOnly: true,
    possibleValues: ARMOR_CATEGORIES.map((category) => ({ value: category, label: capitalize(category) })),
  },
  {
    path: "shield.held",
    description: "Whether a shield is carried, in any weapon set",
    type: "boolean" as const,
    sortOrder: 2,
    requirementOnly: true,
  },
  // Hit points
  { path: "hp.base", description: "From hit dice rolls", type: "number" as const },
  { path: "hp.constitution", description: "Con modifier per level", type: "number" as const, requirementOnly: true },
  { path: "hp.misc", description: "Other bonuses to HP", type: "number" as const },
  { path: "hp.total", description: "All HP sources combined", type: "number" as const, requirementOnly: true },
  // Initiative
  { path: "initiative.dexterity", description: "Dex modifier", type: "number" as const, requirementOnly: true },
  { path: "initiative.misc", description: "Other bonuses to initiative", type: "number" as const },
  {
    path: "initiative.total",
    description: "All initiative bonuses combined",
    type: "number" as const,
    requirementOnly: true,
  },
  // Attack
  { path: "bab", description: "From class progression", type: "number" as const },
  {
    path: "throwing.tohit",
    description: "Bonus to hit with thrown weapons and slings (a halfling's +1)",
    type: "number" as const,
  },
  {
    path: "naturalattacks.secondarypenalty",
    description: "Penalty on secondary natural attacks: -5, -2 with Multiattack",
    type: "number" as const,
  },
  {
    path: "naturalattacks.extraattacks",
    description:
      "Extra attacks with the primary natural weapon, each at -5 (a companion's Multiattack, under 3 attacks)",
    type: "number" as const,
  },
  {
    path: "naturalattacks.count",
    description: "Natural attacks made in a round (two claws are two)",
    type: "number" as const,
    requirementOnly: true,
  },
  { path: "grapple.bab", description: "BAB contribution", type: "number" as const, requirementOnly: true },
  { path: "grapple.strength", description: "Str modifier", type: "number" as const, requirementOnly: true },
  { path: "grapple.size", description: "From race size", type: "number" as const, requirementOnly: true },
  { path: "grapple.misc", description: "Other bonuses to grapple", type: "number" as const },
  {
    path: "grapple.total",
    description: "All grapple bonuses combined",
    type: "number" as const,
    requirementOnly: true,
  },
  {
    path: "twoweapon.mainhandpenalty",
    description: "Penalty on main-hand attacks with two weapons: -6",
    type: "number" as const,
  },
  {
    path: "twoweapon.offhandpenalty",
    description: "Penalty on off-hand attacks with two weapons: -10",
    type: "number" as const,
  },
  {
    path: "twoweapon.offhandattacks",
    description: "Attacks the off hand makes with two weapons",
    type: "number" as const,
  },
  // Movement
  {
    path: "speed.base",
    description: "From race, and fast movement: what armor and load slow (ft)",
    type: "number" as const,
  },
  { path: "speed.misc", description: "Other bonuses to speed, after armor and load (ft)", type: "number" as const },
  { path: "speed.total", description: "Final movement speed (ft)", type: "number" as const, requirementOnly: true },
];

const ENCUMBRANCE_LABELS: Record<string, string> = {
  encumbrance: "Encumbrance",
  carriedweight: "Carried Weight",
  heavyload: "Heavy Load",
  load: "Load",
};

const ENCUMBRANCE_PATHS = [
  { path: "carriedweight", description: "Total weight of items (lbs)", type: "number" as const },
  // Computed from the strength when read: for requirements only. The carried weight is an input, which modifiers change
  { path: "heavyload", description: "Max carry capacity (lbs)", type: "number" as const, requirementOnly: true },
  {
    path: "load",
    description: "The load carried: light, medium, heavy or overloaded",
    type: "string" as const,
    requirementOnly: true,
    possibleValues: LOAD_CATEGORIES.map((load) => ({ value: load, label: capitalize(load) })),
  },
];

/** The combat target paths: AC, hit points, attacks, initiative, speed, encumbrance. */
export default class CombatPaths implements PathCategory<Dnd35Components> {
  static generateCombatPaths(kind: "modifier" | "requirement"): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const path of COMBAT_PATHS) {
      if ("requirementOnly" in path && path.requirementOnly && kind === "modifier") continue;
      paths.push({
        path: `combat.${path.path}`,
        category: "combat",
        description: path.description,
        valueType: path.type,
        operators:
          path.type === "number" ? getNumericOperators(kind) : kind === "modifier" ? ["set"] : ["equal", "not_equal"],
        ...("sortOrder" in path && { sortOrder: path.sortOrder }),
        ...("possibleValues" in path && { possibleValues: path.possibleValues }),
      });
    }

    return paths;
  }

  static generateEncumbrancePaths(kind: "modifier" | "requirement"): TargetPath[] {
    return ENCUMBRANCE_PATHS.filter((path) => kind === "requirement" || !("requirementOnly" in path)).map((path) => ({
      path: `combat.encumbrance.${path.path}`,
      category: "combat",
      description: path.description,
      valueType: path.type,
      operators: path.type === "string" ? ["equal", "not_equal"] : getNumericOperators(kind),
      ...("possibleValues" in path && { possibleValues: path.possibleValues }),
    }));
  }

  readonly component = { key: "combat", getter: "getCombat" } as const;

  readonly description = "AC, hit points, attack bonuses, initiative, speed, armor and shield";

  readonly label = "Combat";

  readonly name = "combat";

  readonly pathDescriptions = {
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
  };

  generate(_rulesetData: RulesetData, kind: "modifier" | "requirement"): TargetPath[] {
    return [...CombatPaths.generateCombatPaths(kind), ...CombatPaths.generateEncumbrancePaths(kind)];
  }

  getSegmentLabels(): Record<string, string> {
    return {
      ...deriveSegmentLabels(COMBAT_PATHS, COMBAT_LABELS),
      ...deriveSegmentLabels(ENCUMBRANCE_PATHS, ENCUMBRANCE_LABELS),
    };
  }
}
