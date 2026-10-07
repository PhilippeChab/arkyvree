import type { RulesetData } from "@/server/cache/rulesetCache/index.ts";

import { type BondedRaceStatBlock, getBondedRaceStats } from "./bondedRaceData.ts";
import DetailedCharacterBonded from "./DetailedCharacterBonded.ts";

/**
 * SRD Familiar mechanic:
 *   - HP = floor(½ master HP)
 *   - BAB and base saves = master's values
 *   - Natural armor bonus by master level: +1 at L1-2 ... +10 at L19-20
 *   - Intelligence progression: 6 at L1-2, +1 per 2 master levels, max 15 at L19-20
 *
 * The race's Int score is ignored — a familiar is smarter than a normal
 * animal of its kind and uses the master-level progression instead.
 *
 * Skills: "for each skill in which either the master or the familiar has ranks, use either the normal skill ranks for
 * an animal of that type or the master's skill ranks, whichever is better", with the familiar's own ability modifiers.
 */
export default class DetailedCharacterFamiliar extends DetailedCharacterBonded {
  /** The master's skill ranks, by skill slug: the familiar's where they're better than its own. */
  private masterSkillRanks: Record<string, number> = {};

  /** The stat block's skills, then its master's ranks where they're better. */
  protected override applyRaceDefaults(raceStats: BondedRaceStatBlock, rulesetData: RulesetData): void {
    super.applyRaceDefaults(raceStats, rulesetData);
    this.components.skills.applyBetterRanks(this.masterSkillRanks);
  }

  protected async applyMasterDerivation(parentCharacterId: string, rulesetData: RulesetData): Promise<void> {
    const master = await this.loadMaster(parentCharacterId, rulesetData);
    const masterLevel = master.components.identity.getIdentity().meta.level;
    const naBonus = Math.min(10, Math.max(1, Math.ceil(masterLevel / 2)));
    const familiarInt = Math.min(15, 5 + Math.ceil(masterLevel / 2));

    const masterCombat = master.components.combat.getCombat();
    const familiarCombat = this.components.combat.getCombat();

    familiarCombat.hp.base = Math.floor(masterCombat.hp.total / 2);
    familiarCombat.bab = masterCombat.bab;

    const raceStats = getBondedRaceStats(this.race?.name);
    familiarCombat.ac.natural = (raceStats?.baseNaturalArmor ?? 0) + naBonus;

    const intelligence = this.components.abilities.getAbility("Intelligence");
    if (intelligence) {
      intelligence.base = familiarInt;
      intelligence.level = 0;
    }

    const masterSaves = master.components.savingThrows.getSavingThrows();
    const familiarSaves = this.components.savingThrows.getSavingThrows();
    for (const saveName of Object.keys(familiarSaves))
      if (masterSaves[saveName]) familiarSaves[saveName].base = masterSaves[saveName].base;

    this.masterSkillRanks = Object.fromEntries(
      Object.entries(master.components.skills.getSkills()).map(([slug, skill]) => [slug, skill.rank]),
    );

    // Familiar HP = ½ master HP only — no per-HD Con component.
    this.cachedTotalHD = 0;
  }
}
