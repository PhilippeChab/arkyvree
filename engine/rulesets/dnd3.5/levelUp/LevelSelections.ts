import RulesError from "@/engine/core/RulesError.ts";
import FeatEntity, { type PoolModifier } from "@/engine/rulesets/dnd3.5/entities/feats/FeatEntity.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";

import LevelUpBase from "./LevelUpBase.ts";
import type { LevelPickRows } from "./plans.ts";

/**
 * A character's saved level's selections, from its rows, as the level's edit opens them: each feat it picked with the
 * pools its modifiers add slots to.
 */
export default class LevelSelections extends LevelUpBase<DetailedCharacter> {
  /**
   * A saved level's selections: its skill ranks, its feats by pool (each with the pools its modifiers add slots to) and
   * its spells by pool (each with its spell level in the pool when it has one).
   */
  private buildLevelSelections({ feats: levelFeats, spells: levelSpells, skills: levelSkills }: LevelPickRows) {
    const dnd35 = this.dnd35;
    const skills: Record<string, number> = {};
    for (const s of levelSkills) skills[s.skillId] = s.rank;

    const detailsOf = this.featDetailsOf(levelFeats.map((f) => f.featId));
    const feats: Record<
      string,
      { aptitudeModifiers: PoolModifier[]; description?: string; id: string; name: string }[]
    > = {};
    for (const f of levelFeats) {
      const feat = dnd35.featsById.get(f.featId);
      (feats[f.aptitudeId] ??= []).push({
        id: f.featId,
        name: feat?.name ?? f.featId,
        description: feat?.description ?? undefined,
        ...detailsOf(f.featId),
      });
    }

    // All ids are the view's on both sides
    const spellLevelMap = this.buildSpellLevelLookup(levelSpells.map((p) => p.spellId));
    const spells: Record<string, { description?: string; id: string; name: string; spellLevel?: number }[]> = {};
    for (const p of levelSpells) {
      const level = spellLevelMap.get(`${p.spellId}:${p.aptitudeId}`);
      const spell = dnd35.spellsById.get(p.spellId);
      (spells[p.aptitudeId] ??= []).push({
        id: p.spellId,
        name: spell?.name ?? p.spellId,
        description: spell?.description ?? undefined,
        ...(level != null && { spellLevel: level }),
      });
    }
    return { skills, feats, spells };
  }

  /** The pools each of these picked feats' modifiers add slots to, by feat. */
  private featDetailsOf(featIds: string[]) {
    const pools = new FeatEntity(this.view).describePoolModifiers(featIds);
    return (featId: string) => ({ aptitudeModifiers: pools.get(featId) ?? [] });
  }

  /**
   * The character's saved level `characterLevelId`: its class level, its hit points and the bounds its ruleset sets
   * them by its class's die (`hitPoints`), its ability increases, its skill ranks, its feats by pool and its spells by
   * pool. Refused when the character has no such level. Its increases are none where its rules give it none now (its
   * ruleset moved them): its edit opens without them, which a save could never keep, and writes them away.
   */
  describeLevel(characterLevelId: string) {
    const level = this.character.rows.levels.find((saved) => saved.id === characterLevelId);
    if (!level) throw new RulesError("not-found", "Character level not found");
    const { abilityIncreases, ...picks } = this.getSavedPicks(characterLevelId);
    const { klassLevel, klass } = this.getSavedKlassLevel(level);
    // The levels in the order the character took them: the level's index is its total level less one
    const increased = this.rules.getAbilityIncreaseTotal(this.view, this.character.rows.levels.indexOf(level)) > 0;
    return {
      characterLevelId: level.id,
      klassId: klass.id,
      klassName: klass.name,
      level: klassLevel.level,
      hd: klass.hd,
      hitPoints: this.rules.hitPointsOf(klass.hd),
      hp: level.hp,
      abilityIncreases: increased ? abilityIncreases.map(({ abilityId, amount }) => ({ abilityId, amount })) : [],
      ...this.buildLevelSelections(picks),
    };
  }
}
