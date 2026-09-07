import type { CachedRulesetData } from "@/server/cache/rulesetCache.ts";
import DetailedCharacterBonded from "./DetailedCharacterBonded.ts";
import { getBondedRaceStats, type BondedRaceStatBlock } from "./bondedRaceData.ts";
import { scaledFeats, scaledSkillTotals } from "./bondedScaling.ts";

/**
 * SRD Paladin's Special Mount progression — keyed on paladin class level.
 * The mount only exists once the master reaches paladin 5; below that the
 * bracket is null and the mount keeps its base race stats only.
 */
type MountRow = {
  bonusHD: number;
  natural: number;
  str: number;
  int: number;
};

function bracketAt(paladinLevel: number): MountRow | null {
  if (paladinLevel < 5) return null;
  if (paladinLevel <= 7) return { bonusHD: 2, natural: 4, str: 1, int: 6 };
  if (paladinLevel <= 10) return { bonusHD: 4, natural: 6, str: 2, int: 7 };
  if (paladinLevel <= 14) return { bonusHD: 6, natural: 8, str: 3, int: 8 };
  return { bonusHD: 8, natural: 10, str: 4, int: 9 };
}

const HD_PER_LEVEL_AVG = 4.5;

function bab34(totalHD: number): number {
  return Math.floor((totalHD * 3) / 4);
}

function goodSaveAt(hd: number): number {
  return 2 + Math.floor(hd / 2);
}

function poorSaveAt(hd: number): number {
  return Math.floor(hd / 3);
}

/**
 * Paladin's Special Mount (SRD):
 *   total HD = race.baseHD + bonusHD (from the level-bracket table).
 *   HP, BAB, and base saves are computed at total HD; natural armor stacks
 *   race base + bracket NA adj; Str gets bracket Str adj; Int is *set* to
 *   the bracket value (overriding the animal's natural Int 2).
 */
export default class DetailedCharacterMount extends DetailedCharacterBonded {
  protected override applyRaceDefaults(raceStats: BondedRaceStatBlock, rulesetData: CachedRulesetData): void {
    const totalHD = this.cachedTotalHD ?? raceStats.baseHD;
    this.applyGrantedFeats(scaledFeats(raceStats, totalHD), rulesetData);
    this.applySkillTotals(scaledSkillTotals(raceStats, totalHD));
  }

  protected async applyMasterDerivation(
    parentCharacterId: string,
    rulesetData: CachedRulesetData,
  ): Promise<void> {
    const master = await this.loadMaster(parentCharacterId, rulesetData);
    const effective = master.getDetailedCharacterBonds().getBondedLevel("mount");
    const row = bracketAt(effective);
    const raceStats = getBondedRaceStats(this.race?.name);
    const baseHD = raceStats?.baseHD ?? 1;
    const totalHD = baseHD + (row?.bonusHD ?? 0);
    this.cachedTotalHD = totalHD;

    const abilities = this.detailedCharacterAbilities.getAbilities();
    if (row && row.str !== 0 && abilities["strength"]) {
      abilities["strength"].misc += row.str;
      this.detailedCharacterAbilities.updateTotal("strength");
    }
    if (row && abilities["intelligence"]) {
      abilities["intelligence"].base = row.int;
      abilities["intelligence"].misc = 0;
      abilities["intelligence"].level = 0;
      this.detailedCharacterAbilities.updateTotal("intelligence");
    }

    const combat = this.detailedCharacterCombat.getCombat();
    combat.ac.natural = (raceStats?.baseNaturalArmor ?? 0) + (row?.natural ?? 0);
    combat.bab = bab34(totalHD);
    combat.hp.base = Math.ceil(totalHD * HD_PER_LEVEL_AVG);
    combat.hp.misc = 0;

    const saves = this.detailedCharacterSavingThrows.getSavingThrows();
    if (saves["fortitude"]) saves["fortitude"].base = goodSaveAt(totalHD);
    if (saves["reflex"]) saves["reflex"].base = goodSaveAt(totalHD);
    if (saves["will"]) saves["will"].base = poorSaveAt(totalHD);

    // Share Saving Throws (Special Mount, paladin 5+): each save uses
    // max(master, mount). Only applies once the mount exists, which by
    // construction means paladin >= 5.
    if (row) {
      const masterSaves = master.getDetailedCharacterSavingThrows().getSavingThrows();
      for (const saveName of Object.keys(saves)) {
        if (masterSaves[saveName]) {
          saves[saveName].base = Math.max(saves[saveName].base, masterSaves[saveName].base);
        }
      }
    }
  }
}
