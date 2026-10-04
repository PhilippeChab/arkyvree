import type { Constructor } from "@/server/mixins.ts";
import type CombatState from "@/server/rulesets/dnd3.5/combat/CombatState.ts";
import { type CharacterLevel } from "@/shared/relations.ts";

/** A character's hit points: its classes' hit dice and its Constitution. */
export function HitPoints<B extends Constructor<CombatState>>(Base: B) {
  abstract class WithHitPoints extends Base {
    protected initializeHitPoints(levels: CharacterLevel[], constitutionModifier: number): void {
      this.hitDieRolls = levels.map((level) => level.hp);
      const baseHitPoints = this.hitDieRolls.reduce((acc, roll) => acc + roll, 0);
      const constitutionBonus = this.constitutionHitPoints(constitutionModifier);

      this.detailedCharacterCombat.hp = {
        base: baseHitPoints,
        constitution: constitutionBonus,
        misc: 0,
        total: baseHitPoints + constitutionBonus,
      };
    }

    protected updateHitPointsTotal() {
      const hp = this.detailedCharacterCombat.hp;
      hp.constitution = this.constitutionHitPoints(this.characterAbilities.getAbilityModifier("Constitution"));
      hp.total = hp.base + hp.constitution + hp.misc;
    }

    /**
     * The hit points Constitution adds: its modifier on each level's roll, though a penalty never drops a level below 1
     * hit point (SRD). A bonded creature's hit dice are its average, so its modifier adds once per hit die.
     */
    private constitutionHitPoints(constitutionModifier: number): number {
      if (this.hitDiceOverride !== null) return constitutionModifier * this.hitDiceOverride;
      return this.hitDieRolls.reduce((acc, roll) => acc + Math.max(constitutionModifier, 1 - roll), 0);
    }

    setHitDiceOverride(hd: number | null) {
      this.hitDiceOverride = hd;
    }
  }
  return WithHitPoints;
}
