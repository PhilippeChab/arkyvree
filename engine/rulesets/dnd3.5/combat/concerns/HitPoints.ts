import type CombatState from "@/engine/rulesets/dnd3.5/combat/CombatState.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { type CharacterLevel } from "@/shared/relations.ts";

/** A character's hit points: its classes' hit dice and its Constitution. */
export function HitPoints<B extends Constructor<CombatState>>(Base: B) {
  abstract class WithHitPoints extends Base {
    /**
     * The hit points Constitution adds: its modifier on each level's roll, though a penalty never drops a level below 1
     * hit point (SRD). A bonded creature's hit dice are its average, so its modifier adds once per hit die.
     */
    private constitutionHitPoints(): number {
      const constitutionModifier = this.abilities.getAbilityModifier("Constitution");
      if (this.hitDiceOverride !== null) return constitutionModifier * this.hitDiceOverride;
      return this.hitDieRolls.reduce((acc, roll) => acc + Math.max(constitutionModifier, 1 - roll), 0);
    }

    /**
     * The hit points: the rolls (base) and misc are inputs, which modifiers change; Constitution's part and the total
     * are computed when read, so they follow the Constitution.
     */
    protected initializeHitPoints(levels: CharacterLevel[]): void {
      const constitution = () => this.constitutionHitPoints();
      this.hitDieRolls = levels.map((level) => level.hp);
      this.combat.hp = {
        base: this.hitDieRolls.reduce((acc, roll) => acc + roll, 0),
        get constitution() {
          return constitution();
        },
        misc: 0,
        get total() {
          return this.base + this.constitution + this.misc;
        },
      };
    }

    setHitDiceOverride(hd: number | null) {
      this.hitDiceOverride = hd;
    }
  }
  return WithHitPoints;
}
