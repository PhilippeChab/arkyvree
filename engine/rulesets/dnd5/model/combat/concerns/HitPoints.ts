import type CombatState from "@/engine/rulesets/dnd5/model/combat/CombatState.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { MIN_HIT_POINTS_PER_LEVEL } from "@/vocabulary/dnd5/classes.ts";

/**
 * A character's hit points, as the SRD 5.2.1 counts them: each level's (its first, its hit die's highest; each other,
 * rolled or its fixed value, `levelHitPoints`) and its Constitution modifier on each, though a level never gives fewer
 * than 1.
 */
export function HitPoints<B extends Constructor<CombatState>>(Base: B) {
  abstract class WithHitPoints extends Base {
    /** The hit points Constitution adds: its modifier on each level's, a level giving 1 at least. */
    private constitutionHitPoints(): number {
      const modifier = this.abilities.getAbilityModifier("Constitution");
      return this.levelHitPoints.reduce(
        (total, roll) => total + Math.max(modifier, MIN_HIT_POINTS_PER_LEVEL - roll),
        0,
      );
    }

    /**
     * The hit points: the levels' (base) and misc are inputs, which modifiers change; Constitution's part and the total
     * are computed when read, so they follow the Constitution.
     */
    protected initializeHitPoints(rolls: number[]): void {
      const constitution = () => this.constitutionHitPoints();
      this.levelHitPoints = rolls;
      this.combat.hp = {
        base: rolls.reduce((total, roll) => total + roll, 0),
        get constitution() {
          return constitution();
        },
        misc: 0,
        get total() {
          return this.base + this.constitution + this.misc;
        },
      };
    }
  }
  return WithHitPoints;
}
