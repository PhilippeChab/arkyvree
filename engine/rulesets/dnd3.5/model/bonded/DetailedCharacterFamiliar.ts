import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import {
  type BondedRaceStatBlock,
  FAMILIAR_HIT_POINTS_DIVISOR,
  FAMILIAR_INTELLIGENCE,
  FAMILIAR_MASTER_LEVELS_PER_STEP,
  FAMILIAR_NATURAL_ARMOR,
} from "@/vocabulary/dnd3.5/bondedCreatures.ts";

import BondedRaceData from "./BondedRaceData.ts";
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

  protected override applyMasterDerivation(master: DetailedCharacter): void {
    const masterLevel = master.components.identity.getIdentity().meta.level;
    const step = Math.ceil(masterLevel / FAMILIAR_MASTER_LEVELS_PER_STEP);
    const naBonus = Math.min(FAMILIAR_NATURAL_ARMOR.max, Math.max(FAMILIAR_NATURAL_ARMOR.min, step));
    const familiarInt = Math.min(FAMILIAR_INTELLIGENCE.max, FAMILIAR_INTELLIGENCE.base + step);

    const masterCombat = master.components.combat.getCombat();
    const familiarCombat = this.components.combat.getCombat();

    familiarCombat.hp.base = Math.floor(masterCombat.hp.total / FAMILIAR_HIT_POINTS_DIVISOR);
    familiarCombat.bab = masterCombat.bab;

    const raceStats = BondedRaceData.getStats(this.data.race.name);
    familiarCombat.ac.natural = (raceStats?.baseNaturalArmor ?? 0) + naBonus;

    const intelligence = this.components.abilities.getAbility("Intelligence");
    if (intelligence) {
      intelligence.base = familiarInt;
      intelligence.level = 0;
    }

    const masterSaves = master.components.saves.getSaves();
    const familiarSaves = this.components.saves.getSaves();
    for (const saveName of Object.keys(familiarSaves))
      if (masterSaves[saveName]) familiarSaves[saveName].base = masterSaves[saveName].base;

    this.masterSkillRanks = Object.fromEntries(
      Object.entries(master.components.skills.getSkills()).map(([slug, skill]) => [slug, skill.rank]),
    );

    // Familiar HP = ½ master HP only: no hit dice, so no Constitution per hit die
    this.components.combat.setHitDiceOverride(0);
  }

  /** The stat block's skills, then its master's ranks where they're better. */
  protected override applyRaceDefaults(raceStats: BondedRaceStatBlock): void {
    super.applyRaceDefaults(raceStats);
    this.components.skills.applyBetterRanks(this.masterSkillRanks);
  }
}
