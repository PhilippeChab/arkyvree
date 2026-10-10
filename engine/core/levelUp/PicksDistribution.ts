import type { LevelPicks } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";

/** A pool a level-up's picks overfill, as the character holding them says: its name, its picks and its room for them. */
interface OverfullPool {
  name: string;
  picked: number;
  room: number;
}

/** Each planned level's slots in each feat pool, by pool id. */
export type FeatSlots = Record<string, number[]>;

/** What a save places its pooled feats and powers by: each planned level's slots in each pool. */
export interface PoolSlots {
  perLevelFeatSlots: FeatSlots;
  perLevelPowerSlots: PowerSlots;
}

/** Each planned level's slots in each power pool, by spell level, by pool id. */
export type PowerSlots = Record<string, Record<string, number>[]>;

/**
 * A save's pooled picks (`LevelPicks`: skill points, and feats and powers by pool) spread over its planned levels, in
 * order, by what the ruleset gives each level (`D`: its slots in each pool, and what its skill points spread by). The
 * feats and powers go in the levels' slots; the skill points as the ruleset spreads them (`distributeSkills`). A pick
 * past its pool's slots isn't dropped: it goes on the level of the feat that gives its pool more room, or the last one,
 * and the save refuses picks that overfill their pool (`refuseOverfull`).
 */
export default abstract class PicksDistribution<D extends PoolSlots> {
  constructor(protected readonly data: D) {}

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

  /** Spreads each skill's points (`skills`, in the order given) over the levels (`result`), as the ruleset does. */
  protected abstract distributeSkills(skills: Record<string, number>, result: LevelPicks[]): void;

  /** How many levels the picks are spread over. */
  protected abstract get levelCount(): number;

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

  /**
   * Puts each pool's powers into the levels' slots: in order for an unleveled pool, by spell level for a leveled one
   * (a power's level per pool from `powerLevelLookup`).
   */
  private distributePowers(
    powers: Record<string, string[]>,
    powerLevelLookup: Map<string, number | null>,
    result: LevelPicks[],
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
   * The pooled picks (`picks`), spread: each level's skill points, and its feats and powers by pool.
   * `powerLevelLookup` is each power's spell level by `powerId:aptitudeId`; `aptitudeSources` the feat that gives a
   * pool room past its slots.
   */
  distribute(
    { feats, powers, skills }: LevelPicks,
    powerLevelLookup: Map<string, number | null>,
    aptitudeSources: Map<string, string>,
  ): LevelPicks[] {
    const result: LevelPicks[] = Array.from({ length: this.levelCount }, () => ({
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
