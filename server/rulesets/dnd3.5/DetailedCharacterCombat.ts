import { include } from "@/server/mixins.ts";
import type DetailedCharacterEncumbrance from "@/server/rulesets/dnd3.5/DetailedCharacterEncumbrance.ts";
import type DetailedCharacterSkills from "@/server/rulesets/dnd3.5/DetailedCharacterSkills.ts";
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
import { type CharacterLevel, type Race } from "@/shared/relations.ts";

import { ArmorClass } from "./combat/ArmorClass.ts";
import { Attacks } from "./combat/Attacks.ts";
import CombatState, { type DetailedCharacterComprehensiveCombat } from "./combat/CombatState.ts";
import { HitPoints } from "./combat/HitPoints.ts";
import { InitiativeAndSpeed } from "./combat/InitiativeAndSpeed.ts";

const NAVIGATABLE_PATHS = [
  // Self-targeting weapon paths (resolved to the source item's equipped weapon slot)
  { path: "tohit.strength", description: "Weapon attack strength modifier", type: "number" as const, sortOrder: 0 },
  { path: "tohit.magic", description: "Enhancement bonus", type: "number" as const, sortOrder: 0 },
  { path: "tohit.size", description: "Size modifier to attack", type: "number" as const, sortOrder: 0 },
  { path: "tohit.misc", description: "Other bonuses to attack", type: "number" as const, sortOrder: 0 },
  { path: "damage.base", description: "Base damage dice", type: "string" as const, sortOrder: 1 },
  { path: "damage.strength", description: "Weapon damage strength modifier", type: "number" as const, sortOrder: 1 },
  { path: "damage.magic", description: "Enhancement bonus", type: "number" as const, sortOrder: 1 },
  { path: "damage.misc", description: "Other bonuses to damage", type: "number" as const, sortOrder: 1 },
  { path: "damage.critical.range", description: "Weapon critical threat range", type: "number" as const, sortOrder: 1 },
  { path: "damage.critical.multiplier", description: "Critical hit multiplier", type: "number" as const, sortOrder: 1 },
  {
    path: "damage.strmultiplier",
    description: "Str-to-damage ratio (1x/0.5x/1.5x)",
    type: "number" as const,
    sortOrder: 1,
  },
  // Armor class
  { path: "ac.base", description: "Default 10", type: "number" as const, sortOrder: 2 },
  { path: "ac.armor", description: "Armor bonus to AC", type: "number" as const, sortOrder: 2 },
  { path: "ac.shield", description: "Shield bonus to AC", type: "number" as const, sortOrder: 2 },
  { path: "ac.dexterity", description: "Dexterity bonus to AC", type: "number" as const, sortOrder: 2 },
  { path: "ac.natural", description: "Natural armor bonus", type: "number" as const, sortOrder: 2 },
  { path: "ac.deflection", description: "Deflection bonus to AC", type: "number" as const, sortOrder: 2 },
  { path: "ac.size", description: "Size modifier to AC", type: "number" as const, sortOrder: 2 },
  { path: "ac.misc", description: "Other bonuses to AC", type: "number" as const, sortOrder: 2 },
  {
    path: "ac.total",
    description: "All AC bonuses combined",
    type: "number" as const,
    sortOrder: 2,
    requirementOnly: true,
  },
  { path: "ac.touch", description: "Ignores armor, shield, natural", type: "number" as const, sortOrder: 2 },
  { path: "ac.flatfooted", description: "Ignores Dex bonus", type: "number" as const, sortOrder: 2 },
  // Hit points
  { path: "hp.base", description: "From hit dice rolls", type: "number" as const },
  { path: "hp.constitution", description: "Con modifier per level", type: "number" as const },
  { path: "hp.misc", description: "Other bonuses to HP", type: "number" as const },
  { path: "hp.total", description: "All HP sources combined", type: "number" as const, requirementOnly: true },
  // Initiative
  { path: "initiative.dexterity", description: "Dex modifier", type: "number" as const },
  { path: "initiative.misc", description: "Other bonuses to initiative", type: "number" as const },
  {
    path: "initiative.total",
    description: "All initiative bonuses combined",
    type: "number" as const,
    requirementOnly: true,
  },
  // Attack
  { path: "bab", description: "From class progression", type: "number" as const },
  { path: "grapple.bab", description: "BAB contribution", type: "number" as const },
  { path: "grapple.strength", description: "Str modifier", type: "number" as const },
  { path: "grapple.size", description: "From race size", type: "number" as const },
  { path: "grapple.misc", description: "Other bonuses to grapple", type: "number" as const },
  {
    path: "grapple.total",
    description: "All grapple bonuses combined",
    type: "number" as const,
    requirementOnly: true,
  },
  { path: "twoweapon.mainhand", description: "Penalty on main-hand attacks with two weapons", type: "number" as const },
  { path: "twoweapon.offhand", description: "Penalty on off-hand attacks with two weapons", type: "number" as const },
  {
    path: "twoweapon.offhandattacks",
    description: "Attacks the off hand makes with two weapons",
    type: "number" as const,
  },
  // Movement
  { path: "speed.base", description: "From race (ft)", type: "number" as const },
  { path: "speed.misc", description: "Other bonuses to speed (ft)", type: "number" as const },
  { path: "speed.total", description: "Final movement speed (ft)", type: "number" as const, requirementOnly: true },
  { path: "encumbrance.carriedweight", description: "Total weight of items (lbs)", type: "number" as const },
  { path: "encumbrance.heavyload", description: "Max carry capacity (lbs)", type: "number" as const },
];

const SEGMENT_LABELS: Record<string, string> = {
  tohit: "To Hit",
  ac: "Armor Class",
  hp: "Hit Points",
  bab: "Base Attack Bonus",
  grapple: "Grapple",
  twoweapon: "Two-Weapon Fighting",
  mainhand: "Main Hand",
  offhand: "Off Hand",
  offhandattacks: "Off-Hand Attacks",
  encumbrance: "Encumbrance",
  carriedweight: "Carried Weight",
  heavyload: "Heavy Load",
};

class DetailedCharacterCombat extends include(CombatState, ArmorClass, HitPoints, Attacks, InitiativeAndSpeed) {
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
        operators: getNumericOperators(kind),
        ...("sortOrder" in path && { sortOrder: path.sortOrder }),
      });
    }

    return paths;
  }

  initialize(race: Race, klassLevelProperties: Map<string, { bab: number; skills: number }>) {
    this.raceSize = race.size;

    const dexterityModifier = this.characterAbilities.getAbilityModifier("Dexterity");
    const constitutionModifier = this.characterAbilities.getAbilityModifier("Constitution");

    const classes = this.characterClasses.getClasses();
    const levels = Object.values(classes).reduce((acc, klass) => {
      for (const level of klass.levels) {
        acc.push(level.characterLevel);
      }
      return acc;
    }, [] as CharacterLevel[]);

    this.initializeArmorClass(dexterityModifier);
    this.initializeHitPoints(levels, constitutionModifier);
    this.initializeInitiative(dexterityModifier);
    this.initializeBaseAttackBonus(classes, klassLevelProperties);
    this.initializeSpeed(race);

    this.addWeapon(0, "Main Hand", { name: "Unarmed Strike" }, [
      { type: WEAPON_PROFICIENCY, value: "Unarmed" },
      { type: WEAPON_BASE_DAMAGE, value: "1d3" },
      { type: DAMAGE_TYPE, value: "Bludgeoning" },
      { type: WEAPON_CRITICAL_RANGE, value: "1" },
      { type: WEAPON_CRITICAL_MULTIPLIER, value: "2" },
      { type: WEAPON_FINESSABLE, value: "true" },
    ]);
  }

  getCombat(): DetailedCharacterComprehensiveCombat {
    return this.detailedCharacterCombat;
  }

  setEncumbranceSource(encumbrance: DetailedCharacterEncumbrance) {
    this.characterEncumbrance = encumbrance;
  }

  setSkills(skills: DetailedCharacterSkills) {
    this.characterSkills = skills;
  }

  updateTotals() {
    if (this.characterEncumbrance) {
      this.characterEncumbrance.updateTotals();
      const enc = this.characterEncumbrance.getEncumbrance();
      this.detailedCharacterCombat.encumbrance = enc;
    }
    this.recalculateDexterityAc();
    this.updateArmorClassTotal();
    this.updateHitPointsTotal();
    this.updateInitiativeTotal();
    this.updateGrappleTotal();
    this.updateSpeedTotal();
    this.updateWeaponsTotal();
    this.characterSkills?.updateTotals();
  }
}

export default DetailedCharacterCombat;
