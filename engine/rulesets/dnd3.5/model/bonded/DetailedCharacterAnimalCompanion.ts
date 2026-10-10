import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";

import BondedRaceData from "./BondedRaceData.ts";
import DetailedCharacterAdvancingBonded from "./DetailedCharacterAdvancingBonded.ts";

/**
 * SRD basics-table progression keyed by effective AC level (data-driven sum
 * of all granting-class contributions: druid + ½ ranger + beastmaster, etc.).
 *
 * Effective level <= 0 means the master is too low-level for this companion
 * (or has no druid/ranger levels yet); the AC keeps its base race statistics
 * only, with no bonus HD or adjustments.
 */
type BasicsRow = {
  bonusHD: number;
  natural: number;
  strDex: number;
};

const BASICS_TABLE: BasicsRow[] = [
  { bonusHD: 0, natural: 0, strDex: 0 },
  { bonusHD: 0, natural: 0, strDex: 0 },
  { bonusHD: 2, natural: 2, strDex: 1 },
  { bonusHD: 2, natural: 2, strDex: 1 },
  { bonusHD: 2, natural: 2, strDex: 1 },
  { bonusHD: 4, natural: 4, strDex: 2 },
  { bonusHD: 4, natural: 4, strDex: 2 },
  { bonusHD: 4, natural: 4, strDex: 2 },
  { bonusHD: 6, natural: 6, strDex: 3 },
  { bonusHD: 6, natural: 6, strDex: 3 },
  { bonusHD: 6, natural: 6, strDex: 3 },
  { bonusHD: 8, natural: 8, strDex: 4 },
  { bonusHD: 8, natural: 8, strDex: 4 },
  { bonusHD: 8, natural: 8, strDex: 4 },
  { bonusHD: 10, natural: 10, strDex: 5 },
  { bonusHD: 10, natural: 10, strDex: 5 },
  { bonusHD: 10, natural: 10, strDex: 5 },
  { bonusHD: 12, natural: 12, strDex: 6 },
  { bonusHD: 12, natural: 12, strDex: 6 },
  { bonusHD: 12, natural: 12, strDex: 6 },
];

function basicsAt(effectiveLevel: number): BasicsRow {
  if (effectiveLevel <= 0) return BASICS_TABLE[0];
  const idx = Math.min(effectiveLevel, BASICS_TABLE.length) - 1;
  return BASICS_TABLE[idx];
}

/**
 * Effective AC level = the master's resolved `bonded.animalcompanion.level`,
 * which is the sum of every grant feat's template-modifier contribution
 * (Druid full, Ranger half via `floor([classes.ranger.level] / 2)`,
 * Beastmaster `max(0, level + 3)`, etc.). Adding a new class that grants
 * an AC needs no code change here — just the right feat template.
 */
function getAnimalCompanionEffectiveLevel(master: DetailedCharacter): number {
  return master.components.bonded.getBondedLevel("animalcompanion");
}

/**
 * Animal Companion mechanic (SRD Druid Animal Companion Basics):
 *   total HD = race.baseHD + bonusHD (from basics table at effective level).
 *   HP, BAB, and base saves are computed from total HD; the animal's natural
 *   armor stacks the race's base NA with the basics-table NA delta. Str/Dex
 *   bonuses apply on top of the race's ability modifiers.
 */
export default class DetailedCharacterAnimalCompanion extends DetailedCharacterAdvancingBonded {
  protected override applyMasterDerivation(master: DetailedCharacter): void {
    const effective = getAnimalCompanionEffectiveLevel(master);
    const row = basicsAt(effective);
    const raceStats = BondedRaceData.getStats(this.data.race.name);
    const baseHD = raceStats?.baseHD ?? 1;
    const totalHD = baseHD + row.bonusHD;

    if (row.strDex !== 0) {
      for (const name of ["Strength", "Dexterity"]) {
        const ability = this.components.abilities.getAbility(name);
        if (ability) ability.misc += row.strDex;
      }
    }

    this.applyHitDice(totalHD, (raceStats?.baseNaturalArmor ?? 0) + row.natural);
  }
}
