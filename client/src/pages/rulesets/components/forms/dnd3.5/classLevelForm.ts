export interface LevelSave {
  saveId: string;
  base: number;
}

export interface LevelFeat {
  featId: string;
  aptitudeId: string;
}

/** Every ruleset save with its base at this level, 0 when unset: the shape the level endpoints take. */
export function allLevelSaves(rulesetSaves: { id: string }[], saves: LevelSave[]): LevelSave[] {
  return rulesetSaves.map((save) => ({ saveId: save.id, base: saves.find((s) => s.saveId === save.id)?.base ?? 0 }));
}
