import { COMBAT_RULES } from "@/vocabulary/dnd3.5/combat.ts";

/** The 3.5 attack rules: the attacks a round a base attack bonus gives, and the farthest a ranged attack reaches. */
export default class AttackRules {
  /**
   * The farthest a ranged or thrown attack reaches, in feet: its range increment times the increments its weapon
   * reaches (`WEAPON_MAX_RANGE_INCREMENTS`: a projectile weapon's ten, a net's one), a thrown weapon's five when it
   * doesn't say (`THROWN_RANGE_INCREMENTS`). None without a range increment.
   */
  static computeMaxRange(range: number, increments: number | null): number {
    return range * (increments ?? COMBAT_RULES.THROWN_RANGE_INCREMENTS);
  }

  /**
   * The attacks a round a base attack bonus gives: each 5 less than the last while positive (`ATTACK_STEP`), four at most
   * (`MAX_ITERATIVE_ATTACKS`: an epic +21 attacks at +21/+16/+11/+6), or the bonus alone. A character's weapons attack
   * from them, and a class's table writes its levels' by them ("+6/+1").
   */
  static listIterativeAttacks(bab: number): number[] {
    const attacks: number[] = [];
    for (
      let bonus = bab;
      bonus > 0 && attacks.length < COMBAT_RULES.MAX_ITERATIVE_ATTACKS;
      bonus -= COMBAT_RULES.ATTACK_STEP
    )
      attacks.push(bonus);

    return attacks.length > 0 ? attacks : [bab];
  }
}
