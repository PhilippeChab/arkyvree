import type { CharacterRows } from "@/engine/core/module/index.ts";
import type { LevelAbilityIncrease, LevelFeat, LevelPower, LevelSkill } from "@/engine/rulesets/dnd3.5/view/rows.ts";

/** A 3.5 character's saved levels' picks: their ability increases, feats and powers by pool, and skill ranks. */
export interface SavedPickRows {
  abilityIncreases: LevelAbilityIncrease[];
  feats: LevelFeat[];
  powers: LevelPower[];
  skills: LevelSkill[];
}

/** A character's saved picks, as 3.5's storage declares each pick (`DND35_STORAGE.character.picks`). */
export default class SavedPicks {
  /** A character's saved picks (`rows.picks`), each in its pick's shape. */
  static of(rows: Pick<CharacterRows, "picks">): SavedPickRows {
    return rows.picks as unknown as SavedPickRows;
  }
}
