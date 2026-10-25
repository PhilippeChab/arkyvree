/**
 * What a 3.5 level writes: its row's columns, and its ability increases and picks under it. Its plans are the level-up
 * part's (`LevelsPlan`, `LevelEditPlan`) in 3.5's shapes.
 */

import type { CharacterRows, ChildrenPlan } from "@/engine/core/module/index.ts";

/** An ability a level raises, and by how much. */
export interface AbilityIncrease {
  abilityId: string;
  amount: number;
}

/** A feat picked in a pool. */
export interface FeatPick {
  aptitudeId: string;
  featId: string;
}

/** A level's row, as a level-up writes it beside its character's: its class level and hit points. */
export interface LevelColumns {
  hp: number;
  klassLevelId: string;
}

/** What a 3.5 edit writes of the level it edits, checked (`LevelEditPlan`): its hit points and its rows under it. */
export interface LevelEditPlan extends ChildrenPlan {
  columns: Pick<LevelColumns, "hp">;
  level: CharacterRows["levels"][number];
  rows: Pick<LevelRows, keyof LevelRows>;
}

/** A level's picks as the rows a level-up writes: its feats and spells, each in its pool, and its skill ranks. */
export interface LevelPickRows {
  feats: FeatPick[];
  skills: SkillRank[];
  spells: SpellPick[];
}

/** A level's rows in the tables under it, by pick, as a level-up writes them: its ability increases and its picks. */
export interface LevelRows extends LevelPickRows {
  abilityIncreases: AbilityIncrease[];
}

/** What a 3.5 level-up writes, checked (`LevelsPlan`): each level's writes. */
export interface LevelsPlan extends ChildrenPlan {
  levels: LevelWrites[];
}

/** What a 3.5 level-up writes of a level (`LevelWrites`): its class level and hit points, and its rows under it. */
export interface LevelWrites {
  columns: Pick<LevelColumns, keyof LevelColumns>;
  rows: Pick<LevelRows, keyof LevelRows>;
}

/** A skill's ranks a level buys. */
export interface SkillRank {
  rank: number;
  skillId: string;
}

/** A spell picked in a pool. */
export interface SpellPick {
  aptitudeId: string;
  spellId: string;
}
