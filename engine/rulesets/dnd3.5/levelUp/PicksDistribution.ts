import RulesError from "@/engine/core/RulesError.ts";
import SkillRules from "@/engine/rulesets/dnd3.5/rules/SkillRules.ts";

import type { LevelPicks } from "./requests.ts";

/** A pool a level-up's picks overfill, as the character holding them says: its name, its picks and its room for them. */
export interface OverfullPool {
  name: string;
  picked: number;
  room: number;
}

/** What a save spreads its pooled picks over its planned levels by: each level's slots, points and class skills. */
export interface PerLevelDistributionData extends PoolSlots {
  perLevelClassSkillIds: string[][];
  perLevelSkillPoints: number[];
  savedLevelCount: number;
  /** Each skill's rank so far and whether it's a class skill, by its id (`contextsOf`). */
  skillContexts: Map<string, { currentRank: number; isClassSkill: boolean }>;
}

/** What a save places its pooled feats and spells by: each planned level's slots in each pool. */
export interface PoolSlots {
  perLevelFeatSlots: FeatSlots;
  perLevelSpellSlots: SpellSlots;
}

/** Each planned level's slots in each feat pool, by pool id. */
export type FeatSlots = Record<string, number[]>;

/** Each planned level's slots in each spell pool, by spell level, by pool id. */
export type SpellSlots = Record<string, Record<string, number>[]>;

/**
 * A save's pooled picks (`LevelPicks`: skill points, and feats and spells by pool) spread over its planned levels, in
 * order, by what each level gives (`data`: its slots in each pool, its skill points and class skills). The feats and
 * spells go in the levels' slots; each skill's points over the levels' points, class-skill levels first, within the
 * skill's rank cap at each level. A pick past its pool's slots isn't dropped: it goes on the level of the feat that
 * gives its pool more room, or the last one, and the save refuses picks that overfill their pool (`refuseOverfull`).
 */
export default class PicksDistribution {
  constructor(private readonly data: PerLevelDistributionData) {}

  /** Each skill's rank so far and whether it's a class skill, which cap its ranks: by its id, of the step's skills. */
  static contextsOf(skills: { currentRank: number; id: string; isClassSkill: boolean }[]) {
    return new Map(skills.map(({ currentRank, id, isClassSkill }) => [id, { currentRank, isClassSkill }]));
  }

  /**
   * The planned level a pool's next pick goes on, as the save hands a pool's picks out over its slots (`slotsPerLevel`,
   * in plan order): the first level whose slots so far outnumber the `picked`, the last once they're all taken.
   */
  static nextLevelOf(slotsPerLevel: number[], picked: number) {
    let slots = 0;
    for (const [index, levelSlots] of slotsPerLevel.entries()) {
      slots += levelSlots;
      if (slots > picked) return index;
    }
    return Math.max(0, slotsPerLevel.length - 1);
  }

  /**
   * Refuses picks that overfill their pools (`overfull`, as the character holding them says): a save keeps every pick
   * it's given, whatever it's forced past, or refuses them.
   */
  static refuseOverfull(overfull: OverfullPool[]) {
    if (overfull.length > 0) {
      const message = overfull.map(({ name, picked, room }) => `${name}: ${picked} picked, room for ${room}`);
      throw new RulesError("invalid", message.join("; "));
    }
  }

  /**
   * Caps a skill's points at what each level can take: the ranks its max rank leaves (a cross-class rank costs two
   * points) and the points it has left. What goes over moves on to the next level.
   */
  private capAtMaxRanks(skillId: string, perLevel: number[], remainingPointsPerLevel: number[]) {
    const { data } = this;
    const ctx = data.skillContexts.get(skillId);
    if (!ctx) return;

    let isClassSoFar = ctx.isClassSkill;
    let cumulativeRank = ctx.currentRank;
    let overflow = 0;
    for (let i = 0; i < perLevel.length; i++) {
      perLevel[i] += overflow;
      overflow = 0;

      if (data.perLevelClassSkillIds[i].includes(skillId)) isClassSoFar = true;

      if (perLevel[i] === 0) continue;

      const charLevelAtI = data.savedLevelCount + i + 1;
      const maxRank = SkillRules.maxRank(charLevelAtI, isClassSoFar);
      const isClassForLevel = data.perLevelClassSkillIds[i].includes(skillId);
      const headroom = maxRank - cumulativeRank;
      const maxPointsByRank = Math.max(0, Math.floor(SkillRules.pointsFor(headroom, isClassForLevel)));
      const maxPointsByBudget = remainingPointsPerLevel[i];
      const maxPoints = Math.min(maxPointsByRank, maxPointsByBudget);

      if (perLevel[i] > maxPoints) {
        overflow = perLevel[i] - maxPoints;
        perLevel[i] = maxPoints;
      }
      const actualRank = SkillRules.ranksFor(perLevel[i], isClassForLevel);
      cumulativeRank += actualRank;
    }
  }

  /**
   * Puts each pool's feats into the levels' slots. A pool with no slots, one a feat's modifier created, goes on the
   * level its source feat went to (the first when that's unknown); a pool's feats past its slots go there too (the
   * last when that's unknown).
   */
  private distributeFeats(feats: Record<string, string[]>, aptitudeSources: Map<string, string>, result: LevelPicks[]) {
    const unplaced: { aptitudeId: string; featIds: string[]; level: number }[] = [];
    const assignedFeatLevels = new Map<string, number>();

    for (const [aptitudeId, featIds] of Object.entries(feats)) {
      const slotsPerLevel = this.data.perLevelFeatSlots[aptitudeId] ?? [];
      if (!slotsPerLevel.some((s) => s > 0)) {
        unplaced.push({ aptitudeId, featIds, level: 0 });
        continue;
      }

      const left = this.fillSlots(
        result.length,
        featIds,
        (i) => slotsPerLevel[i] ?? 0,
        (i, featId) => {
          (result[i].feats[aptitudeId] ??= []).push(featId);
          assignedFeatLevels.set(featId, i);
        },
      );
      if (left.length > 0) unplaced.push({ aptitudeId, featIds: left, level: result.length - 1 });
    }

    for (const { aptitudeId, featIds, level } of unplaced) {
      const sourceFeatId = aptitudeSources.get(aptitudeId);
      const sourceLevel = sourceFeatId === undefined ? undefined : assignedFeatLevels.get(sourceFeatId);
      (result[sourceLevel ?? level].feats[aptitudeId] ??= []).push(...featIds);
    }
  }

  /** Spreads each skill's points over the levels, within each level's points and max ranks. */
  private distributeSkills(skills: Record<string, number>, result: LevelPicks[]) {
    const remainingPointsPerLevel = [...this.data.perLevelSkillPoints];

    for (const [skillId, totalPoints] of Object.entries(skills)) {
      if (totalPoints <= 0) continue;

      const { perLevel } = SkillRules.spend(
        skillId,
        totalPoints,
        this.data.perLevelClassSkillIds,
        remainingPointsPerLevel,
      );
      this.capAtMaxRanks(skillId, perLevel, remainingPointsPerLevel);

      for (let i = 0; i < result.length; i++) {
        if (perLevel[i] > 0) {
          result[i].skills[skillId] = (result[i].skills[skillId] ?? 0) + perLevel[i];
          remainingPointsPerLevel[i] -= perLevel[i];
        }
      }
    }
  }

  /**
   * Puts each pool's spells into the levels' slots: in order for an unleveled pool, by spell level for a leveled one
   * (a spell's level per pool from `spellLevelLookup`).
   */
  private distributeSpells(
    spells: Record<string, string[]>,
    spellLevelLookup: Map<string, number | null>,
    result: LevelPicks[],
  ) {
    for (const [aptitudeId, spellIds] of Object.entries(spells)) {
      const slotsPerLevel = this.data.perLevelSpellSlots[aptitudeId] ?? [];
      const place = (i: number, spellId: string) => (result[i].spells[aptitudeId] ??= []).push(spellId);

      const spellsByLevel = new Map<string, string[]>();
      let hasLevels = false;
      for (const spellId of spellIds) {
        const pl = spellLevelLookup.get(`${spellId}:${aptitudeId}`);
        const key = String(pl ?? 0);
        if (pl !== undefined && pl !== null) hasLevels = true;
        if (!spellsByLevel.has(key)) spellsByLevel.set(key, []);
        spellsByLevel.get(key)!.push(spellId);
      }

      // What the slots leave goes on the last level
      const placeLeft = (left: string[]) => {
        for (const spellId of left) place(result.length - 1, spellId);
      };
      if (!hasLevels) {
        const totalSlotsAt = (i: number) => Object.values(slotsPerLevel[i] ?? {}).reduce((sum, n) => sum + n, 0);
        placeLeft(this.fillSlots(result.length, spellIds, totalSlotsAt, place));
      } else {
        for (const [plKey, levelSpellIds] of spellsByLevel)
          placeLeft(this.fillSlots(result.length, levelSpellIds, (i) => (slotsPerLevel[i] ?? {})[plKey] ?? 0, place));
      }
    }
  }

  /**
   * Hands `ids` out in order to the levels' slots, as many to a level as `slotsAt` gives it: the ids past them, which
   * it leaves to its caller.
   */
  private fillSlots(
    levelCount: number,
    ids: string[],
    slotsAt: (level: number) => number,
    place: (level: number, id: string) => void,
  ) {
    let pickIndex = 0;
    for (let i = 0; i < levelCount && pickIndex < ids.length; i++) {
      const slots = slotsAt(i);
      for (let s = 0; s < slots && pickIndex < ids.length; s++) {
        place(i, ids[pickIndex]);
        pickIndex++;
      }
    }
    return ids.slice(pickIndex);
  }

  /** The planned levels: one for each level's skill points. */
  private get levelCount() {
    return this.data.perLevelSkillPoints.length;
  }

  /**
   * The pooled picks (`picks`), spread: each level's skill points, and its feats and spells by pool.
   * `spellLevelLookup` is each spell's spell level by `spellId:aptitudeId`; `aptitudeSources` the feat that gives a
   * pool room past its slots.
   */
  distribute(
    { feats, spells, skills }: LevelPicks,
    spellLevelLookup: Map<string, number | null>,
    aptitudeSources: Map<string, string>,
  ): LevelPicks[] {
    const result: LevelPicks[] = Array.from({ length: this.levelCount }, () => ({
      skills: {},
      feats: {},
      spells: {},
    }));
    this.distributeSkills(skills, result);
    this.distributeFeats(feats, aptitudeSources, result);
    this.distributeSpells(spells, spellLevelLookup, result);
    return result;
  }

  /**
   * What skill points (`points`, by skill, in the order given) come to, skill by skill, as a save spreads them over the
   * levels: the points each keeps, and the ranks they buy.
   */
  spendSkillPoints(points: Record<string, number>) {
    const spent = new Map<string, { points: number; ranks: number }>();
    const levels = this.distribute({ feats: {}, spells: {}, skills: points }, new Map(), new Map());
    for (const [level, picks] of levels.entries()) {
      for (const [skillId, levelPoints] of Object.entries(picks.skills)) {
        const entry = spent.get(skillId) ?? { points: 0, ranks: 0 };
        const isClassSkill = this.data.perLevelClassSkillIds[level].includes(skillId);
        spent.set(skillId, {
          points: entry.points + levelPoints,
          ranks: entry.ranks + SkillRules.ranksFor(levelPoints, isClassSkill),
        });
      }
    }
    return spent;
  }
}
