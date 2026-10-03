import type { Constructor } from "@/server/mixins.ts";
import type CombatState from "@/server/rulesets/dnd3.5/combat/CombatState.ts";
import { type CharacterLevel } from "@/shared/relations.ts";

/** A character's hit points: its classes' hit dice and its Constitution. */
export function HitPoints<B extends Constructor<CombatState>>(Base: B) {
  abstract class WithHitPoints extends Base {
    protected updateHitPointsTotal() {
      const hp = this.detailedCharacterCombat.hp;
      const numberOfLevels =
        this.hitDiceOverride ??
        Object.values(this.characterClasses.getClasses()).reduce((acc, klass) => acc + klass.level, 0);
      hp.constitution = this.characterAbilities.getAbilityModifier("Constitution") * numberOfLevels;
      hp.total = hp.base + hp.constitution + hp.misc;
    }

    protected initializeHitPoints(levels: CharacterLevel[], constitutionModifier: number): void {
      const baseHitPoints = levels.reduce((acc, level) => acc + level.hp, 0);
      const constitutionBonus = constitutionModifier * levels.length;

      this.detailedCharacterCombat.hp = {
        base: baseHitPoints,
        constitution: constitutionBonus,
        misc: 0,
        total: baseHitPoints + constitutionBonus,
      };
    }

    setHitDiceOverride(hd: number | null) {
      this.hitDiceOverride = hd;
    }
  }
  return WithHitPoints;
}
