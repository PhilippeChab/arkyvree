import SkillRules from "@/engine/rulesets/dnd3.5/rules/SkillRules.ts";

import type { FeatSlots, PowerSlots } from "./AptitudeSlotsPlan.ts";

/** What a planned level takes of the pooled picks. */
interface DistributedLevel {
  feats: Record<string, string[]>;
  powers: Record<string, string[]>;
  skills: Record<string, number>;
}

/** What pooled picks are spread over planned levels by: each level's points, class skills and pool slots. */
export interface PerLevelDistributionData {
  perLevelClassSkillIds: string[][];
  perLevelFeatSlots: FeatSlots;
  perLevelPowerSlots: PowerSlots;
  perLevelSkillPoints: number[];
  savedLevelCount: number;
  /** Each skill's rank so far and whether it's a class skill, by its id (`contextsOf`). */
  skillContexts: Map<string, { currentRank: number; isClassSkill: boolean }>;
}

/**
 * A save's pooled picks (skill ranks, and feats and powers by pool) spread over its planned levels, in order. A pick
 * past its pool's slots isn't dropped: it goes on the level of the feat that gives its pool more room, or the last
 * one, and the save says whether its pool has room for it (`refuseOverfull`).
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
  private distributeFeats(
    feats: Record<string, string[]>,
    aptitudeSources: Map<string, string>,
    result: DistributedLevel[],
  ) {
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

  /**
   * Puts each pool's powers into the levels' slots: in order for an unleveled pool, by spell level for a leveled one
   * (a power's level per pool from `powerLevelLookup`).
   */
  private distributePowers(
    powers: Record<string, string[]>,
    powerLevelLookup: Map<string, number | null>,
    result: DistributedLevel[],
  ) {
    for (const [aptitudeId, powerIds] of Object.entries(powers)) {
      const slotsPerLevel = this.data.perLevelPowerSlots[aptitudeId] ?? [];
      const place = (i: number, powerId: string) => (result[i].powers[aptitudeId] ??= []).push(powerId);

      const powersByLevel = new Map<string, string[]>();
      let hasLevels = false;
      for (const powerId of powerIds) {
        const pl = powerLevelLookup.get(`${powerId}:${aptitudeId}`);
        const key = String(pl ?? 0);
        if (pl !== undefined && pl !== null) hasLevels = true;
        if (!powersByLevel.has(key)) powersByLevel.set(key, []);
        powersByLevel.get(key)!.push(powerId);
      }

      // What the slots leave goes on the last level
      const placeLeft = (left: string[]) => {
        for (const powerId of left) place(result.length - 1, powerId);
      };
      if (!hasLevels) {
        const totalSlotsAt = (i: number) => Object.values(slotsPerLevel[i] ?? {}).reduce((sum, n) => sum + n, 0);
        placeLeft(this.fillSlots(result.length, powerIds, totalSlotsAt, place));
      } else {
        for (const [plKey, levelPowerIds] of powersByLevel)
          placeLeft(this.fillSlots(result.length, levelPowerIds, (i) => (slotsPerLevel[i] ?? {})[plKey] ?? 0, place));
      }
    }
  }

  /** Spreads each skill's points over the levels, within each level's points and max ranks. */
  private distributeSkills(skills: Record<string, number>, result: DistributedLevel[]) {
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

  /**
   * The pooled picks, spread: each level's skill ranks, and its feats and powers by pool. `powerLevelLookup` is each
   * power's spell level by `powerId:aptitudeId`; `aptitudeSources` the feat that gives a pool room past its slots.
   */
  distribute(
    skills: Record<string, number>,
    feats: Record<string, string[]>,
    powers: Record<string, string[]>,
    powerLevelLookup: Map<string, number | null>,
    aptitudeSources: Map<string, string>,
  ): DistributedLevel[] {
    const result: DistributedLevel[] = Array.from({ length: this.data.perLevelSkillPoints.length }, () => ({
      skills: {},
      feats: {},
      powers: {},
    }));
    this.distributeSkills(skills, result);
    this.distributeFeats(feats, aptitudeSources, result);
    this.distributePowers(powers, powerLevelLookup, result);
    return result;
  }
}
