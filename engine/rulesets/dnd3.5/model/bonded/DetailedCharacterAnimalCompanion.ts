import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { ANIMAL_COMPANION_BASICS, type AnimalCompanionBasics } from "@/vocabulary/dnd3.5/bondedCreatures.ts";

import BondedRaceData from "./BondedRaceData.ts";
import DetailedCharacterAdvancingBonded from "./DetailedCharacterAdvancingBonded.ts";

function basicsAt(effectiveLevel: number): AnimalCompanionBasics {
  if (effectiveLevel <= 0) return ANIMAL_COMPANION_BASICS[0];
  const idx = Math.min(effectiveLevel, ANIMAL_COMPANION_BASICS.length) - 1;
  return ANIMAL_COMPANION_BASICS[idx];
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
