import { ITEM_FIELDS } from "@/engine/rulesets/dnd3.5/entities/items/fields.ts";
import type { CustomizedRace } from "@/engine/rulesets/dnd3.5/model/loading/CustomizedEntities.ts";
import { UNARMED_STRIKE } from "@/engine/rulesets/dnd3.5/rules/combat.ts";
import { include } from "@/lib/mixins.ts";
import { type CharacterLevel } from "@/shared/relations.ts";

import CombatState, { type CombatData } from "./CombatState.ts";
import { ArmorClass } from "./concerns/ArmorClass.ts";
import { Attacks } from "./concerns/Attacks.ts";
import { HitPoints } from "./concerns/HitPoints.ts";
import { InitiativeAndSpeed } from "./concerns/InitiativeAndSpeed.ts";

class CombatComponent extends include(CombatState, ArmorClass, Attacks, HitPoints, InitiativeAndSpeed) {
  getCombat(): CombatData {
    return this.combat;
  }

  initialize(race: CustomizedRace, klassLevelProperties: Map<string, { bab: number; skills: number }>) {
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
        ...ITEM_FIELDS.defaults.weapon,
        proficiency: "Unarmed",
        baseDamage: "1d3",
        damageTypes: ["Bludgeoning"],
        criticalRange: 1,
        criticalMultiplier: 2,
        finessable: true,
      },
    );
  }
}

export default CombatComponent;
