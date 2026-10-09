import { include } from "@/lib/mixins.ts";
import type { CharacterLevel } from "@/shared/relations.ts";

import { AnnotatesOptions, type AptitudeModifier } from "./concerns/AnnotatesOptions.ts";
import LevelUpState from "./LevelUpState.ts";

/** A saved level's picks, as the server read them. */
interface SavedPicks {
  feats: { aptitudeId: string; featId: string }[];
  powers: { aptitudeId: string; powerId: string }[];
  skills: { rank: number; skillId: string }[];
}

/** A saved level's selections, as the level's edit opens them. */
export default class LevelSelections extends include(LevelUpState, AnnotatesOptions) {
  /**
   * A saved level's selections: its skill ranks, its feats by pool (each with the pools its modifiers add slots to) and
   * its powers by pool (each with its spell level in the pool when it has one).
   */
  private buildLevelSelections({ feats: levelFeats, powers: levelPowers, skills: levelSkills }: SavedPicks) {
    const skills: Record<string, number> = {};
    for (const s of levelSkills) skills[s.skillId] = s.rank;

    const aptitudeModByFeat = this.resolveAptitudeModifiers(levelFeats.map((f) => f.featId));
    const feats: Record<
      string,
      { aptitudeModifiers: AptitudeModifier[]; description?: string; id: string; name: string }[]
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
   * A saved level's selections (`level`, with its picks): its class level, hit points and ability increase, its skill
   * ranks, its feats by pool and its powers by pool.
   */
  describe(level: CharacterLevel, picks: SavedPicks) {
    const { klassLevel, klass } = this.getSavedKlassLevel(level);
    return {
      characterLevelId: level.id,
      klassId: klass.id,
      klassName: klass.name,
      level: klassLevel.level,
      hd: klass.hd,
      hp: level.hp,
      abilityId: level.abilityId,
      ...this.buildLevelSelections(picks),
    };
  }
}
