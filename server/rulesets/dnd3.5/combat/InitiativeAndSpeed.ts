import type { Constructor } from "@/server/mixins.ts";
import type CombatState from "@/server/rulesets/dnd3.5/combat/CombatState.ts";
import type { RaceWithPMR } from "@/server/rulesets/types.ts";
import { RACE_SPEED_IGNORES_ENCUMBRANCE } from "@/shared/dnd3.5/properties/index.ts";

/** A character's initiative, and its speed under its armor and load (which a dwarf's ignores). */
export function InitiativeAndSpeed<B extends Constructor<CombatState>>(Base: B) {
  abstract class WithInitiativeAndSpeed extends Base {
    /** The initiative: misc is an input; Dexterity's part and the total are computed when read. */
    protected initializeInitiative(): void {
      const dexterity = () => this.characterAbilities.getAbilityModifier("Dexterity");
      this.detailedCharacterCombat.initiative = {
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
    protected initializeSpeed(race: RaceWithPMR): void {
      const overloaded = () => this.detailedCharacterCombat.encumbrance.load === "overloaded";
      const loadedSpeed = (base: number) => this.loadedSpeed(base);
      this.speedIgnoresEncumbrance = race.properties.some(
        (p) => p.type === RACE_SPEED_IGNORES_ENCUMBRANCE && p.value === "true",
      );
      this.detailedCharacterCombat.speed = {
        base: race.baseSpeed,
        misc: 0,
        get total() {
          // The overloaded 5 ft has nothing to add to; otherwise the misc comes on top of the slowed base
          return overloaded() ? 5 : loadedSpeed(this.base) + this.misc;
        },
      };
    }

    /** The base speed under the load and the armor: slowed by a medium or heavy load or by armor, unless the race isn't. */
    private loadedSpeed(base: number): number {
      const { encumbrance, armor } = this.detailedCharacterCombat;
      const heavy = (category: string) => category === "medium" || category === "heavy";
      const slowed = !this.speedIgnoresEncumbrance && (heavy(encumbrance.load) || heavy(armor.category));
      return slowed && this.characterEncumbrance ? this.characterEncumbrance.getEncumberedSpeed(base) : base;
    }
  }
  return WithInitiativeAndSpeed;
}
