import {
  ANIMAL_BAB_PER_HIT_DIE,
  ANIMAL_HIT_DIE_AVERAGE,
  ANIMAL_SAVE_PROGRESSIONS,
  type BondedRaceStatBlock,
} from "@/vocabulary/dnd3.5/bondedCreatures.ts";
import { SAVE_PROGRESSIONS } from "@/vocabulary/dnd3.5/classes.ts";

import BondedScaling from "./BondedScaling.ts";
import DetailedCharacterBonded from "./DetailedCharacterBonded.ts";

/**
 * A bonded animal whose hit dice advance with its master (an animal companion, a special mount): its feats and skills
 * scale to its total HD, and so do its combat statistics, an animal's.
 */
export default abstract class DetailedCharacterAdvancingBonded extends DetailedCharacterBonded {
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
    this.applyGrantedFeats(BondedScaling.scaleFeats(raceStats, totalHD).filter((feat) => !baseFeats.has(feat)));
    for (const [skillName, ranks] of Object.entries(BondedScaling.scaleSkillRanks(raceStats, totalHD)))
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
