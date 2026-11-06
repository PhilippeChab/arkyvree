import type { StoredAdvancement } from "@/engine/core/module/index.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd5.2/model/DetailedCharacter.ts";

import LevelUpBase, { type SavedLevelPicks } from "./LevelUpBase.ts";

/**
 * A character's saved level's selections, from its rows, as the level's edit opens them: its hit points, and its feats
 * and spells, each in its pool.
 */
export default class LevelSelections extends LevelUpBase<DetailedCharacter> {
  /**
   * A saved level's selections: its feats by pool and its spells by pool (each with its spell level in the pool when it
   * has one), each pool's in the order the level's picks were read.
   */
  private buildLevelSelections({ feats: levelFeats, spells: levelSpells }: SavedLevelPicks) {
    const feats: Record<string, string[]> = {};
    for (const { entityId, viaId } of levelFeats) (feats[viaId!] ??= []).push(entityId!);

    // All ids are the view's on both sides
    const spellLevelMap = this.buildSpellLevelLookup(levelSpells.map((p) => p.entityId!));
    const spells: Record<string, { id: string; spellLevel?: number }[]> = {};
    for (const { entityId, viaId } of levelSpells) {
      const spellId = entityId!;
      const level = spellLevelMap.get(`${spellId}:${viaId}`);
      (spells[viaId!] ??= []).push({ id: spellId, ...(level != null && { spellLevel: level }) });
    }
    return { feats, spells };
  }

  /**
   * The character's saved level `level`: its hit points, its feats by pool and its spells by pool. Refused when the
   * view has no class level of it.
   */
  describeLevel(level: StoredAdvancement) {
    const picks = this.getSavedPicks(level.id);
    this.getSavedClassLevel(level);
    // Every saved level holds its hit points: its `hp` pick
    return { hp: picks.hp[0].amount!, ...this.buildLevelSelections(picks) };
  }
}
