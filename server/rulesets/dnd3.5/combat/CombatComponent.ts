import { include } from "@/server/mixins.ts";
import { UNARMED_STRIKE } from "@/server/rulesets/dnd3.5/constants.ts";
import type SkillsComponent from "@/server/rulesets/dnd3.5/skills/SkillsComponent.ts";
import type { CustomizedRace } from "@/server/rulesets/engine/types.ts";
import {
  DAMAGE_TYPE,
  WEAPON_BASE_DAMAGE,
  WEAPON_CRITICAL_MULTIPLIER,
  WEAPON_CRITICAL_RANGE,
  WEAPON_FINESSABLE,
  WEAPON_PROFICIENCY,
} from "@/shared/dnd3.5/properties/index.ts";
import { type CharacterLevel } from "@/shared/relations.ts";

import { ArmorClass } from "./ArmorClass.ts";
import { Attacks } from "./Attacks.ts";
import CombatState, { type CombatData } from "./CombatState.ts";
import type EncumbranceComponent from "./EncumbranceComponent.ts";
import { HitPoints } from "./HitPoints.ts";
import { InitiativeAndSpeed } from "./InitiativeAndSpeed.ts";

class CombatComponent extends include(CombatState, ArmorClass, Attacks, HitPoints, InitiativeAndSpeed) {
  getCombat(): CombatData {
    return this.combat;
  }

  initialize(race: CustomizedRace, klassLevelProperties: Map<string, { bab: number; skills: number }>) {
    this.raceSize = race.size;

    const classes = this.classes.getClasses();
    const levels = Object.values(classes).reduce((acc, klass) => {
      for (const level of klass.levels) acc.push(level.characterLevel);

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
    this.combat.encumbrance = encumbrance.getEncumbrance();
  }

  setSkills(skills: SkillsComponent) {
    this.characterSkills = skills;
  }
}

export default CombatComponent;
