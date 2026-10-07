import type { RulesetData } from "@/server/cache/rulesetCache/index.ts";

import type { BondedRaceStatBlock } from "./bondedRaceData.ts";
import { scaleFeats, scaleSkillRanks } from "./bondedScaling.ts";
import DetailedCharacterBonded from "./DetailedCharacterBonded.ts";

const HD_PER_LEVEL_AVG = 4.5;

/**
 * A bonded animal whose hit dice advance with its master (an animal companion, a special mount): its feats and skills
 * scale to its total HD, and so do its combat statistics, an animal's.
 */
export default abstract class DetailedCharacterAdvancingBonded extends DetailedCharacterBonded {
  /** An animal's statistics at `totalHD`: ¾ BAB, average HP, good Fortitude and Reflex, poor Will. */
  protected applyHitDice(totalHD: number, naturalArmor: number): void {
    this.cachedTotalHD = totalHD;

    const combat = this.components.combat.getCombat();
    combat.ac.natural = naturalArmor;
    combat.bab = Math.floor((totalHD * 3) / 4);
    combat.hp.base = Math.ceil(totalHD * HD_PER_LEVEL_AVG);

    const saves = this.components.savingThrows.getSavingThrows();
    if (saves["fortitude"]) saves["fortitude"].base = 2 + Math.floor(totalHD / 2);
    if (saves["reflex"]) saves["reflex"].base = 2 + Math.floor(totalHD / 2);
    if (saves["will"]) saves["will"].base = Math.floor(totalHD / 3);
  }

  /**
   * The stat block, then what the hit dice past it add: its totals count its own feats' bonuses, so a feat the added
   * hit dice give, and their skill ranks, come on top.
   */
  protected override applyRaceDefaults(raceStats: BondedRaceStatBlock, rulesetData: RulesetData): void {
    const totalHD = this.cachedTotalHD ?? raceStats.baseHD;
    super.applyRaceDefaults(raceStats, rulesetData);
    const baseFeats = new Set(raceStats.baseFeats ?? []);
    this.applyGrantedFeats(
      scaleFeats(raceStats, totalHD).filter((feat) => !baseFeats.has(feat)),
      rulesetData,
    );
    for (const [skillName, ranks] of Object.entries(scaleSkillRanks(raceStats, totalHD)))
      this.components.skills.addRanks(skillName, ranks);
  }
}
