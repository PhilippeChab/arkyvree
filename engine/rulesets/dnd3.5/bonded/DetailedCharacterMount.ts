import type Dnd35DetailedCharacter from "@/engine/rulesets/dnd3.5/character/DetailedCharacter.ts";

import { getBondedRaceStats } from "./bondedRaceData.ts";
import DetailedCharacterAdvancingBonded from "./DetailedCharacterAdvancingBonded.ts";

/**
 * SRD Paladin's Special Mount progression — keyed on paladin class level.
 * The mount only exists once the master reaches paladin 5; below that the
 * bracket is null and the mount keeps its base race stats only.
 */
type MountRow = {
  bonusHD: number;
  int: number;
  natural: number;
  str: number;
};

function bracketAt(paladinLevel: number): MountRow | null {
  if (paladinLevel < 5) return null;
  if (paladinLevel <= 7) return { bonusHD: 2, natural: 4, str: 1, int: 6 };
  if (paladinLevel <= 10) return { bonusHD: 4, natural: 6, str: 2, int: 7 };
  if (paladinLevel <= 14) return { bonusHD: 6, natural: 8, str: 3, int: 8 };
  return { bonusHD: 8, natural: 10, str: 4, int: 9 };
}

/**
 * Paladin's Special Mount (SRD):
 *   total HD = race.baseHD + bonusHD (from the level-bracket table).
 *   HP, BAB, and base saves are computed at total HD; natural armor stacks
 *   race base + bracket NA adj; Str gets bracket Str adj; Int is *set* to
 *   the bracket value (overriding the animal's natural Int 2).
 */
export default class DetailedCharacterMount extends DetailedCharacterAdvancingBonded {
  protected applyMasterDerivation(master: Dnd35DetailedCharacter): void {
    const effective = master.components.bonded.getBondedLevel("mount");
    const row = bracketAt(effective);
    const raceStats = getBondedRaceStats(this.race?.name);
    const baseHD = raceStats?.baseHD ?? 1;
    const totalHD = baseHD + (row?.bonusHD ?? 0);

    const abilities = this.components.abilities.getAbilities();
    if (row && row.str !== 0 && abilities["strength"]) abilities["strength"].misc += row.str;

    if (row && abilities["intelligence"]) {
      abilities["intelligence"].base = row.int;
      abilities["intelligence"].level = 0;
    }

    this.applyHitDice(totalHD, (raceStats?.baseNaturalArmor ?? 0) + (row?.natural ?? 0));

    // Share Saving Throws (Special Mount, paladin 5+): each save uses
    // max(master, mount). Only applies once the mount exists, which by
    // construction means paladin >= 5.
    if (row) {
      const saves = this.components.savingThrows.getSavingThrows();
      const masterSaves = master.components.savingThrows.getSavingThrows();
      for (const saveName of Object.keys(saves))
        if (masterSaves[saveName]) saves[saveName].base = Math.max(saves[saveName].base, masterSaves[saveName].base);
    }
  }
}
