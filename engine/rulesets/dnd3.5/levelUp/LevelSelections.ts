import RulesError from "@/engine/core/RulesError.ts";
import FeatEntity, { type PoolModifier } from "@/engine/rulesets/dnd3.5/entities/feats/FeatEntity.ts";

import LevelUpState from "./LevelUpState.ts";

/** A saved level's picks, as the character's rows hold them. */
interface SavedPicks {
  feats: { aptitudeId: string; featId: string }[];
  powers: { aptitudeId: string; powerId: string }[];
  skills: { rank: number; skillId: string }[];
}

/** A character's saved level's selections, from its rows, as the level's edit opens them. */
export default class LevelSelections extends LevelUpState {
  /**
   * A saved level's selections: its skill ranks, its feats by pool (each with the pools its modifiers add slots to) and
   * its powers by pool (each with its spell level in the pool when it has one).
   */
  private buildLevelSelections({ feats: levelFeats, powers: levelPowers, skills: levelSkills }: SavedPicks) {
    const skills: Record<string, number> = {};
    for (const s of levelSkills) skills[s.skillId] = s.rank;

    const aptitudeModByFeat = new FeatEntity(this.view).describePoolModifiers(levelFeats.map((f) => f.featId));
    const feats: Record<
      string,
      { aptitudeModifiers: PoolModifier[]; description?: string; id: string; name: string }[]
    > = {};
    for (const f of levelFeats) {
      const feat = this.rulesetData.featsById.get(f.featId);
      (feats[f.aptitudeId] ??= []).push({
        id: f.featId,
        name: feat?.name ?? f.featId,
        description: feat?.description ?? undefined,
        aptitudeModifiers: aptitudeModByFeat.get(f.featId) ?? [],
      });
    }

    // All ids are the view's on both sides
    const powerLevelMap = this.buildPowerLevelLookup(levelPowers.map((p) => p.powerId));
    const powers: Record<string, { description?: string; id: string; name: string; powerLevel?: number }[]> = {};
    for (const p of levelPowers) {
      const level = powerLevelMap.get(`${p.powerId}:${p.aptitudeId}`);
      const power = this.rulesetData.powersById.get(p.powerId);
      (powers[p.aptitudeId] ??= []).push({
        id: p.powerId,
        name: power?.name ?? p.powerId,
        description: power?.description ?? undefined,
        ...(level != null && { powerLevel: level }),
      });
    }
    return { skills, feats, powers };
  }

  /**
   * The character's saved level `characterLevelId`: its class level, hit points and ability increase, its skill ranks,
   * its feats by pool and its powers by pool. Refused when the character has no such level.
   */
  describeLevel(characterLevelId: string) {
    const { levels, picks } = this.character.rows;
    const level = levels.find((saved) => saved.id === characterLevelId);
    if (!level) throw new RulesError("not-found", "Character level not found");
    const atLevel = <P extends { characterLevelId: string }>(rows: P[]) =>
      rows.filter((pick) => pick.characterLevelId === characterLevelId);
    const { klassLevel, klass } = this.getSavedKlassLevel(level);
    return {
      characterLevelId: level.id,
      klassId: klass.id,
      klassName: klass.name,
      level: klassLevel.level,
      hd: klass.hd,
      hp: level.hp,
      abilityId: level.abilityId,
      ...this.buildLevelSelections({
        feats: atLevel(picks.feats),
        powers: atLevel(picks.powers),
        skills: atLevel(picks.skills),
      }),
    };
  }
}
