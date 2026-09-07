import type { CachedRulesetData } from "@/server/cache/rulesetCache.ts";
import DetailedCharacterBonded from "./DetailedCharacterBonded.ts";
import { getBondedRaceStats } from "./bondedRaceData.ts";

/**
 * SRD Familiar mechanic:
 *   - HP = floor(½ master HP)
 *   - BAB and base saves = master's values
 *   - Natural armor bonus by master level: +1 at L1-2 ... +10 at L19-20
 *   - Intelligence progression: 6 at L1-2, +1 per 2 master levels, max 15 at L19-20
 *
 * The race's Int score is ignored — a familiar is smarter than a normal
 * animal of its kind and uses the master-level progression instead.
 */
export default class DetailedCharacterFamiliar extends DetailedCharacterBonded {
  protected async applyMasterDerivation(
    parentCharacterId: string,
    rulesetData: CachedRulesetData,
  ): Promise<void> {
    const master = await this.loadMaster(parentCharacterId, rulesetData);
    const masterLevel = master.getDetailedCharacterIdentity().getIdentity().meta.level;
    const naBonus = Math.min(10, Math.max(1, Math.ceil(masterLevel / 2)));
    const familiarInt = Math.min(15, 5 + Math.ceil(masterLevel / 2));

    const masterCombat = master.getDetailedCharacterCombat().getCombat();
    const familiarCombat = this.detailedCharacterCombat.getCombat();

    familiarCombat.hp.base = Math.floor(masterCombat.hp.total / 2);
    familiarCombat.hp.misc = 0;
    familiarCombat.bab = masterCombat.bab;

    const raceStats = getBondedRaceStats(this.race?.name);
    familiarCombat.ac.natural = (raceStats?.baseNaturalArmor ?? 0) + naBonus;

    const intelligence = this.detailedCharacterAbilities.getAbility("Intelligence");
    if (intelligence) {
      intelligence.base = familiarInt;
      intelligence.misc = 0;
      intelligence.level = 0;
      this.detailedCharacterAbilities.updateTotal("Intelligence");
    }

    const masterSaves = master.getDetailedCharacterSavingThrows().getSavingThrows();
    const familiarSaves = this.detailedCharacterSavingThrows.getSavingThrows();
    for (const saveName of Object.keys(familiarSaves)) {
      if (masterSaves[saveName]) {
        familiarSaves[saveName].base = masterSaves[saveName].base;
      }
    }

    // Familiar HP = ½ master HP only — no per-HD Con component.
    this.cachedTotalHD = 0;
  }
}
