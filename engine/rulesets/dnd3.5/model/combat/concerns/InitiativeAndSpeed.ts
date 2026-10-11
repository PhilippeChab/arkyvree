import type CombatState from "@/engine/rulesets/dnd3.5/model/combat/CombatState.ts";
import type { CustomizedRace } from "@/engine/rulesets/dnd3.5/model/loading/loadedEntities.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { OVERLOADED_SPEED } from "@/vocabulary/dnd3.5/carrying.ts";

/** A character's initiative, and its speed under its armor and load (which a dwarf's ignores). */
export function InitiativeAndSpeed<B extends Constructor<CombatState>>(Base: B) {
  abstract class WithInitiativeAndSpeed extends Base {
    /** The base speed under the load and the armor: slowed by a medium or heavy load or by armor, unless the race isn't. */
    private loadedSpeed(base: number): number {
      const { encumbrance, armor } = this.combat;
      const heavy = (category: string) => category === "medium" || category === "heavy";
      const slowed = !this.speedIgnoresEncumbrance && (heavy(encumbrance.load) || heavy(armor.category));
      return slowed ? this.encumbrance.getEncumberedSpeed(base) : base;
    }

    /** The initiative: misc is an input; Dexterity's part and the total are computed when read. */
    protected initializeInitiative(): void {
      const dexterity = () => this.abilities.getAbilityModifier("Dexterity");
      this.combat.initiative = {
        get dexterity() {
          return dexterity();
        },
        misc: 0,
        get total() {
          return this.dexterity + this.misc;
        },
      };
    }

    /** The speed: the race's base and misc are inputs; the total, under the load and the armor, is computed when read. */
    protected initializeSpeed(race: CustomizedRace): void {
      const overloaded = () => this.combat.encumbrance.load === "overloaded";
      const loadedSpeed = (base: number) => this.loadedSpeed(base);
      this.speedIgnoresEncumbrance = race.speedIgnoresEncumbrance;
      this.combat.speed = {
        base: race.baseSpeed,
        misc: 0,
        get total() {
          // The overloaded 5 ft has nothing to add to; otherwise the misc comes on top of the slowed base
          return overloaded() ? OVERLOADED_SPEED : loadedSpeed(this.base) + this.misc;
        },
      };
    }
  }
  return WithInitiativeAndSpeed;
}
