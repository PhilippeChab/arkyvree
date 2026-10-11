import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import {
  ANIMAL_BAB_PER_HIT_DIE,
  ANIMAL_HIT_DIE_AVERAGE,
  ANIMAL_SAVE_PROGRESSIONS,
  ANIMAL_SKILL_POINTS_PER_HIT_DIE,
  type BondedRaceStatBlock,
} from "@/vocabulary/dnd3.5/bondedCreatures.ts";
import { SAVE_PROGRESSIONS } from "@/vocabulary/dnd3.5/classes.ts";

import DetailedCharacterBonded from "./DetailedCharacterBonded.ts";

/**
 * A bonded animal whose hit dice advance with its master (an animal companion, a special mount): its feats and skills
 * scale to its total HD, and so do its combat statistics, an animal's.
 */
export default abstract class DetailedCharacterAdvancingBonded extends DetailedCharacterBonded {
  /**
   * A creature's feats at its total hit dice: as many as the Monster Manual gives, one at the first hit die and one more
   * every third (`LevelRules.countGeneralFeats`, a character's general feats' rule). Its stat block's base feats,
   * then enough of its `featPriority`, in order, to reach that count.
   */
  static scaleFeats(stats: BondedRaceStatBlock, totalHD: number): string[] {
    const count = LevelRules.countGeneralFeats(Math.max(1, totalHD));
    const base = stats.baseFeats ?? [];
    const priority = stats.featPriority ?? [];
    const extras = priority.slice(0, Math.max(0, count - base.length));
    return [...base, ...extras];
  }

  /**
   * The ranks a creature's hit dice past its stat block's give its skills: an animal's skill point per added hit die (2 +
   * its Intelligence modifier, at least 1, and an animal's Intelligence of 1 or 2 makes it 1), each to the next skill of
   * its `skillPriority` in turn. A legal stat block has at most its hit dice + 3 ranks in a skill, and a skill gains at
   * most a rank per added hit die, so none passes the maximum.
   */
  static scaleSkillRanks(stats: BondedRaceStatBlock, totalHD: number): Record<string, number> {
    const ranks: Record<string, number> = {};
    const priority = stats.skillPriority ?? [];
    if (priority.length === 0) return ranks;
    const points = Math.max(0, totalHD - stats.baseHD) * ANIMAL_SKILL_POINTS_PER_HIT_DIE;
    for (let point = 0; point < points; point++) {
      const skill = priority[point % priority.length];
      ranks[skill] = (ranks[skill] ?? 0) + 1;
    }
    return ranks;
  }

  /** Its hit dice, its stat block's and those its master's levels add: what its feats and skills scale to. */
  private totalHitDice: number | null = null;

  /**
   * The stat block, then what the hit dice past it add: its totals count its own feats' bonuses, so a feat the added
   * hit dice give, and their skill ranks, come on top.
   */
  protected override applyRaceDefaults(raceStats: BondedRaceStatBlock): void {
    const totalHD = this.totalHitDice ?? raceStats.baseHD;
    super.applyRaceDefaults(raceStats);
    const baseFeats = new Set(raceStats.baseFeats ?? []);
    this.applyGrantedFeats(
      DetailedCharacterAdvancingBonded.scaleFeats(raceStats, totalHD).filter((feat) => !baseFeats.has(feat)),
    );
    for (const [skillName, ranks] of Object.entries(
      DetailedCharacterAdvancingBonded.scaleSkillRanks(raceStats, totalHD),
    ))
      this.components.skills.addRanks(skillName, ranks);
  }

  /** An animal's statistics at `totalHD`: ¾ BAB, average HP, good Fortitude and Reflex, poor Will. */
  protected applyHitDice(totalHD: number, naturalArmor: number): void {
    this.totalHitDice = totalHD;
    this.components.combat.setHitDiceOverride(totalHD);

    const combat = this.components.combat.getCombat();
    combat.ac.natural = naturalArmor;
    combat.bab = Math.floor(totalHD * ANIMAL_BAB_PER_HIT_DIE);
    combat.hp.base = Math.ceil(totalHD * ANIMAL_HIT_DIE_AVERAGE);

    for (const [name, progression] of Object.entries(ANIMAL_SAVE_PROGRESSIONS)) {
      const save = this.components.saves.getSave(name);
      const { base, hitDicePerPoint } = SAVE_PROGRESSIONS[progression];
      if (save) save.base = base + Math.floor(totalHD / hitDicePerPoint);
    }
  }
}
