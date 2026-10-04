import type { Constructor } from "@/server/mixins.ts";
import type CombatState from "@/server/rulesets/dnd3.5/combat/CombatState.ts";
import type { RaceWithPMR } from "@/server/rulesets/types.ts";
import { RACE_SPEED_IGNORES_ENCUMBRANCE } from "@/shared/dnd3.5/properties/index.ts";

/** A character's initiative, and its speed under its armor and load (which a dwarf's ignores). */
export function InitiativeAndSpeed<B extends Constructor<CombatState>>(Base: B) {
  abstract class WithInitiativeAndSpeed extends Base {
    protected initializeInitiative(dexterityModifier: number): void {
      this.detailedCharacterCombat.initiative.dexterity = dexterityModifier;
      this.detailedCharacterCombat.initiative.total =
        this.detailedCharacterCombat.initiative.dexterity + this.detailedCharacterCombat.initiative.misc;
    }

    protected initializeSpeed(race: RaceWithPMR): void {
      this.detailedCharacterCombat.speed.base = race.baseSpeed;
      this.speedIgnoresEncumbrance = race.properties.some(
        (p) => p.type === RACE_SPEED_IGNORES_ENCUMBRANCE && p.value === "true",
      );
      this.detailedCharacterCombat.speed.total =
        this.detailedCharacterCombat.speed.base + this.detailedCharacterCombat.speed.misc;
    }

    protected updateInitiativeTotal() {
      const initiative = this.detailedCharacterCombat.initiative;
      initiative.dexterity = this.characterAbilities.getAbilityModifier("Dexterity");
      initiative.total = initiative.dexterity + initiative.misc;
    }

    protected updateSpeedTotal() {
      const base = this.detailedCharacterCombat.speed.base;
      const misc = this.detailedCharacterCombat.speed.misc;
      const load = this.detailedCharacterCombat.encumbrance.load;

      if (load === "overloaded") {
        this.detailedCharacterCombat.speed.total = 5;
      } else if (
        !this.speedIgnoresEncumbrance &&
        (load === "medium" || load === "heavy" || this.hasSpeedReducingArmor)
      ) {
        const reducedBase = this.characterEncumbrance ? this.characterEncumbrance.getEncumberedSpeed(base) : base;
        this.detailedCharacterCombat.speed.total = reducedBase + misc;
      } else {
        this.detailedCharacterCombat.speed.total = base + misc;
      }
    }
  }
  return WithInitiativeAndSpeed;
}
