import type { CustomizedRace } from "@/engine/core/types.ts";
import { include } from "@/server/mixins.ts";
import { UNARMED_STRIKE } from "@/server/rulesets/dnd3.5/constants.ts";
import { NO_WEAPON_FIELDS } from "@/server/rulesets/dnd3.5/items/itemFields.ts";
import type SkillsComponent from "@/server/rulesets/dnd3.5/skills/SkillsComponent.ts";
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

    this.addWeapon(
      0,
      "Main Hand",
      { name: UNARMED_STRIKE },
      {
        ...NO_WEAPON_FIELDS,
        proficiency: "Unarmed",
        baseDamage: "1d3",
        damageTypes: ["Bludgeoning"],
        criticalRange: 1,
        criticalMultiplier: 2,
        finessable: true,
      },
    );
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
