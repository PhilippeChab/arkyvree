import RulesError from "@/engine/core/RulesError.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";

import LevelUpBase, { type SavedLevelPicks } from "./LevelUpBase.ts";

/**
 * A character's saved level's selections, from its rows, as the level's edit opens them: its hit points, its ability
 * increases, its skill points, and its feats and spells, each in its pool.
 */
export default class LevelSelections extends LevelUpBase<DetailedCharacter> {
  /**
   * A saved level's selections: its skill points, by skill, its feats by pool and its spells by pool (each with its spell
   * level in the pool when it has one), each pool's in the order the level's picks were read.
   */
  private buildLevelSelections({ feats: levelFeats, spells: levelSpells, skills: levelSkills }: SavedLevelPicks) {
    const skills: Record<string, number> = {};
    for (const s of levelSkills) skills[s.entityId!] = s.amount!;

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
    return { skills, feats, spells };
  }

  /**
   * The character's saved level `advancementId`: its hit points, its ability increases (its `abilities` picks), its
   * skill points, its feats by pool and its spells by pool. Refused when the character has no such level, or the view
   * no class level of it. Its increases are none where its rules give it none now (its ruleset moved them): its edit
   * opens without them, which a save could never keep, and writes them away.
   */
  describeLevel(advancementId: string) {
    const level = this.character.rows.advancements.find((saved) => saved.id === advancementId);
    if (!level) throw new RulesError("not-found", "Character level not found");
    const picks = this.getSavedPicks(advancementId);
    this.getSavedKlassLevel(level);
    // The levels in the order the character took them: the level's index is its total level less one
    const increased =
      this.rules.getAbilityIncreaseTotal(this.view, this.character.rows.advancements.indexOf(level)) > 0;
    return {
      // Every saved level holds its hit points: its `hp` pick
      hp: picks.hp[0].amount!,
      abilityIncreases: increased ? picks.abilities : [],
      ...this.buildLevelSelections(picks),
    };
  }
}
