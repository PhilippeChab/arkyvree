import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";

import type { BondedRaceStatBlock } from "./bondedRaceData.ts";
import { scaledFeats, scaledSkillTotals } from "./bondedScaling.ts";
import DetailedCharacterBonded from "./DetailedCharacterBonded.ts";

const HD_PER_LEVEL_AVG = 4.5;

/**
 * A bonded animal whose hit dice advance with its master (an animal companion, a special mount): its feats and skills
 * scale to its total HD, and so do its combat statistics, an animal's.
 */
export default abstract class DetailedCharacterAdvancingBonded extends DetailedCharacterBonded {
  protected override applyRaceDefaults(raceStats: BondedRaceStatBlock, rulesetData: CachedRulesetData): void {
    const totalHD = this.cachedTotalHD ?? raceStats.baseHD;
    this.applyGrantedFeats(scaledFeats(raceStats, totalHD), rulesetData);
    this.applySkillTotals(scaledSkillTotals(raceStats, totalHD));
  }

  /** An animal's statistics at `totalHD`: ¾ BAB, average HP, good Fortitude and Reflex, poor Will. */
  protected applyHitDice(totalHD: number, naturalArmor: number): void {
    this.cachedTotalHD = totalHD;

    const combat = this.detailedCharacterCombat.getCombat();
    combat.ac.natural = naturalArmor;
    combat.bab = Math.floor((totalHD * 3) / 4);
    combat.hp.base = Math.ceil(totalHD * HD_PER_LEVEL_AVG);
    combat.hp.misc = 0;

    const saves = this.detailedCharacterSavingThrows.getSavingThrows();
    if (saves["fortitude"]) saves["fortitude"].base = 2 + Math.floor(totalHD / 2);
    if (saves["reflex"]) saves["reflex"].base = 2 + Math.floor(totalHD / 2);
    if (saves["will"]) saves["will"].base = Math.floor(totalHD / 3);
  }
}
