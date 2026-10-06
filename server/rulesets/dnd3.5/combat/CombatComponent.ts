import { include } from "@/server/mixins.ts";
import type EncumbranceComponent from "@/server/rulesets/dnd3.5/combat/EncumbranceComponent.ts";
import { UNARMED_STRIKE } from "@/server/rulesets/dnd3.5/constants.ts";
import type SkillsComponent from "@/server/rulesets/dnd3.5/skills/SkillsComponent.ts";
import type { RaceWithPMR } from "@/server/rulesets/engine/types.ts";
import { getNumericOperators } from "@/shared/customization/operators.ts";
import { deriveSegmentLabels, type TargetPath } from "@/shared/customization/target.ts";
import {
  DAMAGE_TYPE,
  WEAPON_BASE_DAMAGE,
  WEAPON_CRITICAL_MULTIPLIER,
  WEAPON_CRITICAL_RANGE,
  WEAPON_FINESSABLE,
  WEAPON_PROFICIENCY,
} from "@/shared/dnd3.5/properties/index.ts";
import { type CharacterLevel } from "@/shared/relations.ts";
import { capitalize } from "@/shared/text.ts";

import { ArmorClass } from "./ArmorClass.ts";
import { Attacks } from "./Attacks.ts";
import CombatState, { ARMOR_CATEGORIES, type DetailedCharacterComprehensiveCombat } from "./CombatState.ts";
import { HitPoints } from "./HitPoints.ts";
import { InitiativeAndSpeed } from "./InitiativeAndSpeed.ts";

const NAVIGATABLE_PATHS = [
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

const SEGMENT_LABELS: Record<string, string> = {
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

class CombatComponent extends include(CombatState, ArmorClass, Attacks, HitPoints, InitiativeAndSpeed) {
  static getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels(NAVIGATABLE_PATHS, SEGMENT_LABELS);
  }

  static generateTargetPaths(kind: "modifier" | "requirement"): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const path of NAVIGATABLE_PATHS) {
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

  getCombat(): DetailedCharacterComprehensiveCombat {
    return this.detailedCharacterCombat;
  }

  initialize(race: RaceWithPMR, klassLevelProperties: Map<string, { bab: number; skills: number }>) {
    this.raceSize = race.size;

    const classes = this.characterClasses.getClasses();
    const levels = Object.values(classes).reduce((acc, klass) => {
      for (const level of klass.levels) {
        acc.push(level.characterLevel);
      }
      return acc;
    }, [] as CharacterLevel[]);

    this.initializeArmorClass();
    this.initializeHitPoints(levels);
    this.initializeInitiative();
    this.initializeBaseAttackBonus(classes, klassLevelProperties);
    this.initializeGrapple();
    this.initializeSpeed(race);

    this.addWeapon(0, "Main Hand", { name: UNARMED_STRIKE }, [
      { type: WEAPON_PROFICIENCY, value: "Unarmed" },
      { type: WEAPON_BASE_DAMAGE, value: "1d3" },
      { type: DAMAGE_TYPE, value: "Bludgeoning" },
      { type: WEAPON_CRITICAL_RANGE, value: "1" },
      { type: WEAPON_CRITICAL_MULTIPLIER, value: "2" },
      { type: WEAPON_FINESSABLE, value: "true" },
    ]);
  }

  /** The encumbrance the sheet shows: the encumbrance's own object, so what changes it (a modifier) is what's read. */
  setEncumbranceSource(encumbrance: EncumbranceComponent) {
    this.characterEncumbrance = encumbrance;
    this.detailedCharacterCombat.encumbrance = encumbrance.getEncumbrance();
  }

  setSkills(skills: SkillsComponent) {
    this.characterSkills = skills;
  }
}

export default CombatComponent;
