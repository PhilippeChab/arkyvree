import type { Constructor } from "@/server/mixins.ts";
import type CombatState from "@/server/rulesets/dnd3.5/combat/CombatState.ts";
import { type Race } from "@/shared/relations.ts";

/** A character's initiative, and its speed under its armor and load. */
export function InitiativeAndSpeed<B extends Constructor<CombatState>>(Base: B) {
  abstract class WithInitiativeAndSpeed extends Base {
    protected initializeInitiative(dexterityModifier: number): void {
      this.detailedCharacterCombat.initiative.dexterity = dexterityModifier;
      this.detailedCharacterCombat.initiative.total =
        this.detailedCharacterCombat.initiative.dexterity + this.detailedCharacterCombat.initiative.misc;
    }

    protected initializeSpeed(race: Race): void {
      this.detailedCharacterCombat.speed.base = race.baseSpeed;
      this.detailedCharacterCombat.speed.total =
        this.detailedCharacterCombat.speed.base + this.detailedCharacterCombat.speed.misc;
    }

    protected updateInitiativeTotal() {
      this.detailedCharacterCombat.initiative.total =
        this.detailedCharacterCombat.initiative.dexterity + this.detailedCharacterCombat.initiative.misc;
    }

    protected updateSpeedTotal() {
      const base = this.detailedCharacterCombat.speed.base;
      const misc = this.detailedCharacterCombat.speed.misc;
      const load = this.detailedCharacterCombat.encumbrance.load;

      if (load === "overloaded") {
        this.detailedCharacterCombat.speed.total = 5;
      } else if (load === "medium" || load === "heavy" || this.hasSpeedReducingArmor) {
        const reducedBase = this.characterEncumbrance ? this.characterEncumbrance.getEncumberedSpeed(base) : base;
        this.detailedCharacterCombat.speed.total = reducedBase + misc;
      } else {
        this.detailedCharacterCombat.speed.total = base + misc;
      }
    }
  }
  return WithInitiativeAndSpeed;
}
