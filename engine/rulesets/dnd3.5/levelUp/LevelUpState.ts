import { LevelUpBase } from "@/engine/core/levelUp/index.ts";
import type { LevelPicks } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { OwnPicks } from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudesComponent.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import SkillsComponent from "@/engine/rulesets/dnd3.5/model/skills/SkillsComponent.ts";

import SkillSpending, { type SpentLevels } from "./SkillSpending.ts";

/** The pools a character picks feats and powers in, and how many, with what a level-up plans. */
type LevelUpPools = ReturnType<DetailedCharacter["components"]["aptitudes"]["getLevelUpPools"]>;

/** A pool overfilled by a level-up's picks, as the character holding them says (`getOverfullPools`). */
type OverfullPool = ReturnType<DetailedCharacter["components"]["aptitudes"]["getOverfullPools"]>[number];

/** A level-up's feats and powers, each by the pool it's picked in. */
export type PoolPicks = Pick<LevelPicks, "feats" | "powers">;

/**
 * What a 3.5 level-up flow reads past core's (`LevelUpBase`): the steps the wizard and the preview share, a feats step,
 * a powers step and a skills step, and which skills a class makes class skills.
 */
export default abstract class LevelUpState extends LevelUpBase<DetailedCharacter> {
  /** Each pool's picks once, in the order given: a pick given twice is one, as a save keeps it. */
  private dedupe(picks: Record<string, string[]>) {
    return Object.fromEntries(Object.entries(picks).map(([aptitudeId, ids]) => [aptitudeId, [...new Set(ids)]]));
  }

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

  /**
   * A level-up's own picks, counted by pool (`OwnPicks`): its feats, and its powers by their spell level there. A pick
   * given twice counts once.
   */
  protected countOwnPicks({ feats = {}, powers = {} }: Partial<PoolPicks>): OwnPicks {
    const lookup = this.buildPowerLevelLookup(Object.values(powers).flat());
    const powerCounts: OwnPicks["powers"] = {};
    for (const [aptitudeId, ids] of Object.entries(this.dedupe(powers))) {
      const counts: Record<string, number> = {};
      for (const powerId of ids) {
        const level = String(lookup.get(`${powerId}:${aptitudeId}`) ?? "");
        counts[level] = (counts[level] ?? 0) + 1;
      }
      powerCounts[aptitudeId] = counts;
    }
    const featCounts = Object.entries(this.dedupe(feats)).map(([aptitudeId, ids]) => [aptitudeId, ids.length]);
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
   * The picks that fit their pools (`picks`, each pool's in its order), and the character holding them (`build`): the
   * latest picks of an overfull pool dropped, and the character built again, until none is (a feat dropped takes the
   * room it gave). What the wizard keeps of its picks, as a save would take them.
   */
  protected fitPicks(picks: Partial<PoolPicks>, build: (picks: PoolPicks) => DetailedCharacter) {
    let fitted: PoolPicks = { feats: this.dedupe(picks.feats ?? {}), powers: this.dedupe(picks.powers ?? {}) };
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
    for (const skill of this.rulesetData.skills) if (SkillsComponent.isSubtypeOf(skill.name, names)) ids.add(skill.id);

    return ids;
  }

  /** The skill points a level-up step spends: what the character has left to spend, at least one. */
  protected getSkillPointsToSpend(character: DetailedCharacter) {
    return Math.max(1, character.components.skills.getSkillBudget().available);
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

  /**
   * Refuses picks (`picks`, which `character` holds) that overfill a pool they're in: a save keeps every pick it's
   * given, whatever it's forced past, or refuses them.
   */
  protected refuseOverfull(character: DetailedCharacter, picks: Partial<PoolPicks>) {
    const overfull = character.components.aptitudes.getOverfullPools(this.countOwnPicks(picks));
    if (overfull.length > 0) {
      const message = overfull.map(({ name, picked, room }) => `${name}: ${picked} picked, room for ${room}`);
      throw new RulesError("invalid", message.join("; "));
    }
  }

  /**
   * A skills step, the wizard's and the preview's alike: the points the character has to spend (at least one), the
   * character's total level after the step's levels (`levels`: each one's class skills and points), and each skill with
   * its class status (`classSkillIds`: the step's classes') and what the form's points (`points`, by skill, in its
   * order) come to over the levels, as a save spreads them (`SkillSpending`).
   */
  protected skillStep(
    character: DetailedCharacter,
    classSkillIds: Set<string>,
    levels: SpentLevels,
    points: Record<string, number>,
  ) {
    const skillPointsToSpend = this.getSkillPointsToSpend(character);
    const stepSkills = character.components.skills.getEnrichedSkills(this.rulesetData.skills, classSkillIds);
    return {
      skillPointsToSpend,
      totalCharacterLevel: levels.savedLevelCount + levels.perLevelSkillPoints.length,
      skills: new SkillSpending(levels, stepSkills).describe(points, skillPointsToSpend),
    };
  }
}
