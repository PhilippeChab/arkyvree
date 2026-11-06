import type DetailedCharacter from "@/engine/rulesets/pf1/model/DetailedCharacter.ts";
import BondedRaceData from "@/engine/rulesets/pf1/rules/BondedRaceData.ts";
import { SPECIAL_MOUNT_BASICS, type SpecialMountBasics } from "@/vocabulary/pf1/bondedCreatures.ts";

import DetailedCharacterAdvancingBonded from "./DetailedCharacterAdvancingBonded.ts";

/**
 * The special mount's bracket at a paladin level (`SPECIAL_MOUNT_BASICS`): none below the first, and the mount keeps its
 * base race stats only.
 */
function bracketAt(paladinLevel: number): SpecialMountBasics | null {
  return SPECIAL_MOUNT_BASICS.findLast((row) => paladinLevel >= row.minLevel) ?? null;
}

/**
 * The paladin's bonded mount (the Core Rulebook's divine bond): an animal companion at her paladin level as its effective
 * druid level, from her 5th.
 *   total HD = race.baseHD + bonusHD (the animal companion's base statistics at that level).
 *   HP, BAB, and base saves are computed at total HD; natural armor stacks
 *   race base + the table's; Str and Dex get the table's bonus; Int is at
 *   least 6 (an animal's is 2). Its saves are its own: it shares none.
 */
export default class DetailedCharacterMount extends DetailedCharacterAdvancingBonded {
  protected override applyMasterDerivation(master: DetailedCharacter): void {
    const effective = master.components.bonded.getBondedLevel("mount");
    const row = bracketAt(effective);
    const raceStats = BondedRaceData.getStats(this.data.race.name);
    const baseHD = raceStats?.baseHD ?? 1;
    const totalHD = baseHD + (row?.bonusHD ?? 0);

    const { abilities } = this.components;
    const strength = abilities.getAbility("Strength");
    const dexterity = abilities.getAbility("Dexterity");
    const intelligence = abilities.getAbility("Intelligence");
    if (row && row.str !== 0 && strength) strength.misc += row.str;
    if (row && row.dex !== 0 && dexterity) dexterity.misc += row.dex;

    if (row && intelligence && intelligence.base < row.int) {
      intelligence.base = row.int;
      intelligence.level = 0;
    }

    this.applyHitDice(totalHD, (raceStats?.baseNaturalArmor ?? 0) + (row?.natural ?? 0));
  }
}
