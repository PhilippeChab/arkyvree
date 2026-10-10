import { type BondedRaceStatBlock } from "./BondedRaceData.ts";
import BondedScaling from "./BondedScaling.ts";
import DetailedCharacterBonded from "./DetailedCharacterBonded.ts";

const HD_PER_LEVEL_AVG = 4.5;

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
    combat.bab = Math.floor((totalHD * 3) / 4);
    combat.hp.base = Math.ceil(totalHD * HD_PER_LEVEL_AVG);

    const { saves } = this.components;
    const [fortitude, reflex, will] = [saves.getSave("Fortitude"), saves.getSave("Reflex"), saves.getSave("Will")];
    if (fortitude) fortitude.base = 2 + Math.floor(totalHD / 2);
    if (reflex) reflex.base = 2 + Math.floor(totalHD / 2);
    if (will) will.base = Math.floor(totalHD / 3);
  }
}
