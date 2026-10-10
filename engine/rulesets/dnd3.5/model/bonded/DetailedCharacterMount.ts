import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { SPECIAL_MOUNT_BASICS, type SpecialMountBasics } from "@/vocabulary/dnd3.5/bondedCreatures.ts";

import BondedRaceData from "./BondedRaceData.ts";
import DetailedCharacterAdvancingBonded from "./DetailedCharacterAdvancingBonded.ts";

/**
 * The special mount's bracket at a paladin level (`SPECIAL_MOUNT_BASICS`): none below the first, and the mount keeps its
 * base race stats only.
 */
function bracketAt(paladinLevel: number): SpecialMountBasics | null {
  return SPECIAL_MOUNT_BASICS.findLast((row) => paladinLevel >= row.minLevel) ?? null;
}

/**
 * Paladin's Special Mount (SRD):
 *   total HD = race.baseHD + bonusHD (from the level-bracket table).
 *   HP, BAB, and base saves are computed at total HD; natural armor stacks
 *   race base + bracket NA adj; Str gets bracket Str adj; Int is *set* to
 *   the bracket value (overriding the animal's natural Int 2).
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
    const intelligence = abilities.getAbility("Intelligence");
    if (row && row.str !== 0 && strength) strength.misc += row.str;

    if (row && intelligence) {
      intelligence.base = row.int;
      intelligence.level = 0;
    }

    this.applyHitDice(totalHD, (raceStats?.baseNaturalArmor ?? 0) + (row?.natural ?? 0));

    // Share Saving Throws (Special Mount, paladin 5+): each save uses
    // max(master, mount). Only applies once the mount exists, which by
    // construction means paladin >= 5.
    if (row) {
      const saves = this.components.saves.getSaves();
      const masterSaves = master.components.saves.getSaves();
      for (const saveName of Object.keys(saves))
        if (masterSaves[saveName]) saves[saveName].base = Math.max(saves[saveName].base, masterSaves[saveName].base);
    }
  }
}
