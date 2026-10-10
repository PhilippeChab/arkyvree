import { COMBAT_RULES } from "@/vocabulary/dnd3.5/combat.ts";

/** The 3.5 attack rules: the attacks a round a base attack bonus gives. */
export default class AttackRules {
  /**
   * The attacks a round a base attack bonus gives: each 5 less than the last while positive (`ATTACK_STEP`), or the
   * bonus alone. A character's weapons attack from them, and a class's table writes its levels' by them ("+6/+1").
   */
  static listIterativeAttacks(bab: number): number[] {
    const attacks: number[] = [];
    for (let bonus = bab; bonus > 0; bonus -= COMBAT_RULES.ATTACK_STEP) attacks.push(bonus);

    return attacks.length > 0 ? attacks : [bab];
  }
}
