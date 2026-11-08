import RulesError from "@/engine/core/RulesError.ts";

import type { LevelPicks } from "./requests.ts";

/** A pool a level-up's picks overfill, as the character holding them says: its name, its picks and its room for them. */
export interface OverfullPool {
  name: string;
  picked: number;
  room: number;
}

/** What a save spreads its pooled picks over its planned levels by: each level's slots in each pool. */
export interface PerLevelDistributionData extends PoolSlots {
  /** The highest spell level each leveled pool has room at before the planned levels, by its id. */
  highestRoomLevels: Record<string, number>;
  /** The planned levels. */
  levelCount: number;
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
 * A save's pooled picks (`LevelPicks`: feats and spells by pool) spread over its planned levels, in order, by what each
 * level gives (`data`: its slots in each pool). The feats go in the levels' slots; a leveled pool's spells too, as the
 * character's sheet counts them (`AptitudesComponent`): a cantrip in a cantrip's slot, and a spell of a level in any
 * slot past cantrips of a level that has room at its level or a higher one by then (its saved room's too), highest
 * spells first, each in the earliest such level. A pick past its pool's slots isn't dropped: it goes on the level of
 * the feat that gives its pool more room, or the last one, and the save refuses picks that overfill their pool
 * (`refuseOverfull`).
 */
export default class PicksDistribution {
  constructor(private readonly data: PerLevelDistributionData) {}

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
   * Puts a leveled pool's spells (`spellIds`, each at its level in the pool, `levelOf`) into the levels' slots
   * (`slotsPerLevel`): its cantrips in order, in its cantrips' slots; its other spells, highest first, each in the
   * earliest level with a slot past cantrips by which the pool has room at its level or a higher one (`highestRoom`,
   * its saved room's highest level, then each level's). What no slot takes goes on the last level (`place`).
   */
  private distributeLeveledSpells(
    spellIds: string[],
    levelOf: (spellId: string) => number,
    slotsPerLevel: Record<string, number>[],
    highestRoom: number,
    place: (level: number, spellId: string) => void,
  ) {
    const last = this.data.levelCount - 1;
    const cantrips = spellIds.filter((spellId) => levelOf(spellId) === 0);
    const cantripSlotsAt = (i: number) => slotsPerLevel[i]?.["0"] ?? 0;
    for (const spellId of this.fillSlots(this.data.levelCount, cantrips, cantripSlotsAt, place)) place(last, spellId);

    const levels = Array.from({ length: this.data.levelCount }, (_, i) => slotsPerLevel[i] ?? {});
    const room = levels.map((slots) =>
      Object.entries(slots).reduce((sum, [tier, n]) => sum + (Number(tier) > 0 ? n : 0), 0),
    );
    let highest = highestRoom;
    const highestAt = levels.map((slots) => {
      for (const [tier, n] of Object.entries(slots)) if (Number(tier) > highest && n > 0) highest = Number(tier);
      return highest;
    });
    const leveled = spellIds.filter((spellId) => levelOf(spellId) > 0).toSorted((a, b) => levelOf(b) - levelOf(a));
    for (const spellId of leveled) {
      const at = room.findIndex((left, i) => left > 0 && highestAt[i] >= levelOf(spellId));
      if (at === -1) {
        place(last, spellId);
        continue;
      }
      room[at]--;
      place(at, spellId);
    }
  }

  /**
   * Puts each pool's spells into the levels' slots: in order for an unleveled pool, by spell level for a leveled one
   * (a spell's level per pool from `spellLevelLookup`), as the 2024 rules prepare them (`distributeLeveledSpells`).
   */
  private distributeSpells(
    spells: Record<string, string[]>,
    spellLevelLookup: Map<string, number | null>,
    result: LevelPicks[],
  ) {
    for (const [aptitudeId, spellIds] of Object.entries(spells)) {
      const slotsPerLevel = this.data.perLevelSpellSlots[aptitudeId] ?? [];
      const place = (i: number, spellId: string) => (result[i].spells[aptitudeId] ??= []).push(spellId);
      const levelOf = (spellId: string) => spellLevelLookup.get(`${spellId}:${aptitudeId}`);
      if (spellIds.some((spellId) => levelOf(spellId) != null)) {
        const highestRoom = this.data.highestRoomLevels[aptitudeId] ?? 0;
        this.distributeLeveledSpells(spellIds, (spellId) => levelOf(spellId) ?? 0, slotsPerLevel, highestRoom, place);
        continue;
      }
      // What the slots leave goes on the last level
      const totalSlotsAt = (i: number) => Object.values(slotsPerLevel[i] ?? {}).reduce((sum, n) => sum + n, 0);
      for (const spellId of this.fillSlots(result.length, spellIds, totalSlotsAt, place))
        place(result.length - 1, spellId);
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
   * The pooled picks (`picks`), spread: each level's feats and spells by pool. `spellLevelLookup` is each spell's spell
   * level by `spellId:aptitudeId`; `aptitudeSources` the feat that gives a pool room past its slots.
   */
  distribute(
    { feats, spells }: LevelPicks,
    spellLevelLookup: Map<string, number | null>,
    aptitudeSources: Map<string, string>,
  ): LevelPicks[] {
    const result: LevelPicks[] = Array.from({ length: this.data.levelCount }, () => ({ feats: {}, spells: {} }));
    this.distributeFeats(feats, aptitudeSources, result);
    this.distributeSpells(spells, spellLevelLookup, result);
    return result;
  }
}
