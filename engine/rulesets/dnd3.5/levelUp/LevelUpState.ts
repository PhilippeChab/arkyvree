import { LevelUpBase } from "@/engine/core/levelUp/index.ts";
import type { LevelPicks } from "@/engine/core/module/index.ts";
import type { OwnPicks } from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudesComponent.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import SkillRules from "@/engine/rulesets/dnd3.5/rules/SkillRules.ts";
import { include } from "@/lib/mixins.ts";

import { SpendsSkillPoints } from "./concerns/SpendsSkillPoints.ts";

/** The pools a character picks feats and powers in, and how many, with what a level-up plans. */
type LevelUpPools = ReturnType<DetailedCharacter["components"]["aptitudes"]["getLevelUpPools"]>;

/** A pool overfilled by a level-up's picks, as the character holding them says (`getOverfullPools`). */
type OverfullPool = ReturnType<DetailedCharacter["components"]["aptitudes"]["getOverfullPools"]>[number];

/** A level-up's feats and powers, each by the pool it's picked in. */
export type PoolPicks = Pick<LevelPicks, "feats" | "powers">;

/**
 * What a 3.5 level-up flow reads past core's (`LevelUpBase`): the steps the wizard and the preview share, a feats step,
 * a powers step and a skills step (`SpendsSkillPoints`), and which skills a class makes class skills.
 */
export default abstract class LevelUpState extends include(LevelUpBase<DetailedCharacter>, SpendsSkillPoints) {
  /**
   * The picks without their latest in the overfull pool (`pool`), as many as it's over: at its spell level for a leveled
   * one; in a shared one, its powers before its feats, the wizard's later step first.
   */
  private dropExcess(picks: PoolPicks, { aptitudeId, level, picked, room }: OverfullPool): PoolPicks {
    let excess = picked - room;
    const lookup = this.buildPowerLevelLookup(picks.powers[aptitudeId] ?? []);
    const powers = [...(picks.powers[aptitudeId] ?? [])];
    for (let i = powers.length - 1; i >= 0 && excess > 0; i--) {
      if (String(lookup.get(`${powers[i]}:${aptitudeId}`) ?? "") !== (level ?? "")) continue;
      powers.splice(i, 1);
      excess--;
    }
    const feats = level === undefined ? (picks.feats[aptitudeId] ?? []).slice(0, -excess || undefined) : undefined;
    return {
      feats: feats ? { ...picks.feats, [aptitudeId]: feats } : picks.feats,
      powers: { ...picks.powers, [aptitudeId]: powers },
    };
  }

  /** Each pool's picks in the order given, a pick given again dropped unless it `stacks`. */
  private dropRepeats(picks: Record<string, string[]>, stacks: (id: string) => boolean) {
    return Object.fromEntries(
      Object.entries(picks).map(([aptitudeId, ids]) => [
        aptitudeId,
        ids.filter((id, index) => stacks(id) || ids.indexOf(id) === index),
      ]),
    );
  }

  /**
   * The picks a save takes, each pool's in the order given: a stackable feat each time it's picked (a row a pick); a
   * non-stackable feat or a power given again in its pool once, since a character takes a non-stackable feat once and
   * knows a power once (a save refuses either picked twice at a level).
   */
  private keepTakenPicks({ feats = {}, powers = {} }: Partial<PoolPicks>): PoolPicks {
    return {
      feats: this.dropRepeats(feats, (id) => this.rulesetData.featsById.get(id)?.stackable === true),
      powers: this.dropRepeats(powers, () => false),
    };
  }

  /**
   * A level-up's own picks, counted by pool (`OwnPicks`): its feats, and its powers by their spell level there, as a
   * save takes them (`keepTakenPicks`): a stackable feat each time, a repeat of the others once.
   */
  protected countOwnPicks(picks: Partial<PoolPicks>): OwnPicks {
    const { feats, powers } = this.keepTakenPicks(picks);
    const lookup = this.buildPowerLevelLookup(Object.values(powers).flat());
    const powerCounts: OwnPicks["powers"] = {};
    for (const [aptitudeId, ids] of Object.entries(powers)) {
      const counts: Record<string, number> = {};
      for (const powerId of ids) {
        const level = String(lookup.get(`${powerId}:${aptitudeId}`) ?? "");
        counts[level] = (counts[level] ?? 0) + 1;
      }
      powerCounts[aptitudeId] = counts;
    }
    const featCounts = Object.entries(feats).map(([aptitudeId, ids]) => [aptitudeId, ids.length]);
    return { feats: Object.fromEntries(featCounts), powers: powerCounts };
  }

  /**
   * A feats step, the wizard's and the preview's alike: how many feats the character picks with what's planned
   * (`pools`), in which pools, and the feats the class levels (`klassLevelIds`) grant.
   */
  protected featStep(pools: LevelUpPools, klassLevelIds: string[]) {
    const { klassLevelFeatsWithFeatsByKlassLevel } = this.rulesetData;
    return {
      featsToSelect: pools.featsToSelect,
      autoGrantedFeats: klassLevelIds.flatMap((id) =>
        (klassLevelFeatsWithFeatsByKlassLevel.get(id) ?? []).map((rec) => rec.featsInRule),
      ),
      aptitudePools: pools.featPools,
    };
  }

  /**
   * The picks that fit their pools (`picks`, each pool's in its order), and the character holding them (`build`): those
   * a save takes (`keepTakenPicks`), then the latest picks of an overfull pool dropped, and the character built again,
   * until none is (a feat dropped takes the room it gave). What the wizard keeps of its picks, as a save would take them.
   */
  protected fitPicks(picks: Partial<PoolPicks>, build: (picks: PoolPicks) => DetailedCharacter) {
    let fitted = this.keepTakenPicks(picks);
    for (;;) {
      const character = build(fitted);
      const [overfull] = character.components.aptitudes.getOverfullPools(this.countOwnPicks(fitted));
      if (!overfull) return { character, picks: fitted };
      fitted = this.dropExcess(fitted, overfull);
    }
  }

  /** The skills class skill records make class skills: theirs, and the ruleset's subtypes of them ("Craft (…)" of Craft). */
  protected getClassSkillIds(records: { skillId: string; skillsInRule: { name: string } }[]): Set<string> {
    const ids = new Set(records.map((record) => record.skillId));
    const names = new Set(records.map((record) => record.skillsInRule.name));
    for (const skill of this.rulesetData.skills) if (SkillRules.isSubtypeOf(skill.name, names)) ids.add(skill.id);

    return ids;
  }

  /**
   * A powers step, the wizard's and the preview's alike: how many powers the character picks with what's planned
   * (`pools`), in which pools, and the powers the class levels (`klassLevelIds`) grant, each saying whether it's free.
   */
  protected powerStep(pools: LevelUpPools, klassLevelIds: string[]) {
    const { klassLevelPowersWithPowersByKlassLevel } = this.rulesetData;
    return {
      powersToSelect: pools.powersToSelect,
      autoGrantedPowers: klassLevelIds.flatMap((id) =>
        (klassLevelPowersWithPowersByKlassLevel.get(id) ?? []).map((rec) => ({ ...rec.powersInRule, free: rec.free })),
      ),
      aptitudePools: pools.powerPools,
    };
  }
}
