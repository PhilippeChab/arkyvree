import type { AbilityIncrease } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";

import type { LevelUpRules } from "./LevelUpBase.ts";

interface FeatRecord extends PickRecord {
  stackable: boolean;
}

/** The level's hit points, ability increases and selections a check reads, with its class and class level. */
interface LevelChecked {
  abilityIncreases: AbilityIncrease[];
  feats: Record<string, string[]>;
  hp: number;
  klass: { hd: number };
  klassLevel: { id: string };
  powers: Record<string, string[]>;
  skills: Record<string, number>;
}

/** A feat or a power picked, as the check names it. */
interface PickRecord {
  id: string;
  name: string;
}

/** A class level's granted feats, as the view joins them to their feats. */
export type GrantedFeatRecords =
  RulesetData["klassLevelFeatsWithFeatsByKlassLevel"] extends Map<string, infer R> ? R : never;

/**
 * A level's selections checked against the ruleset (`rulesetData`): theirs, linked to their pools, and not taken twice;
 * and its hit points and ability increases, within what its ruleset's rules give it (`rules`).
 */
export default class SelectionChecks {
  constructor(
    private readonly rulesetData: RulesetData,
    private readonly rules: Pick<LevelUpRules<unknown>, "getAbilityIncreaseTotal" | "hitPointsOf">,
  ) {}

  /**
   * A level's hit points, ability increases and selections checked, for both the level save and the level-up's: each
   * ability and selection the ruleset's, each selection linked to its pool, no non-stackable feat or power picked twice.
   * Answers the feats picked and what the level is granted, which whether a feat is already on the character reads
   * (`checkNotTaken`).
   */
  private checkLevelSelections(level: LevelChecked) {
    const { klass, klassLevel, hp, abilityIncreases, skills, feats, powers } = level;

    const { max, min } = this.rules.hitPointsOf(klass.hd);
    if (hp < min || hp > max) throw new RulesError("invalid", `HP must be between ${min} and ${max}`);

    // A cache hit means the entity is in the composed view of the character's ruleset
    // (the cache's arrays are already COW-resolved and sibling-filtered).
    if (abilityIncreases.some(({ abilityId }) => !this.rulesetData.abilitiesById.has(abilityId)))
      throw new RulesError("invalid", "Ability does not belong to the character's ruleset");

    // Submitted ids can repeat, in a pool or under two: a stackable feat's may, checkRepeatedPicks refuses the others.
    const { fetchedFeats, fetchedPowers } = this.fetchSelections(skills, feats, powers);
    this.checkRepeatedPicks(feats, fetchedFeats, powers, fetchedPowers);
    this.checkLinks(feats, powers);

    // What the class level grants, which a non-stackable pick can't be
    const autoGrantedRecords = this.rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(klassLevel.id) ?? [];

    return { autoGrantedRecords, fetchedFeats };
  }

  /** Throws when a feat or a power isn't linked to the pool it's picked under. */
  private checkLinks(feats: Record<string, string[]>, powers: Record<string, string[]>) {
    for (const [aptitudeId, ids] of Object.entries(feats)) {
      for (const featId of ids) {
        const links = this.rulesetData.featsById.get(featId)?.featsAptitudesInRules ?? [];
        if (!links.some((fa) => fa.aptitudeId === aptitudeId))
          throw new RulesError("invalid", "Feat is not linked to the specified aptitude");
      }
    }

    for (const [aptitudeId, ids] of Object.entries(powers)) {
      for (const powerId of ids) {
        const links = this.rulesetData.powersById.get(powerId)?.powersAptitudesInRules ?? [];
        if (!links.some((pa) => pa.aptitudeId === aptitudeId))
          throw new RulesError("invalid", "Power is not linked to the specified aptitude");
      }
    }
  }

  /**
   * Throws when a non-stackable feat picked (`feats`) is already on the character: picked at its other levels
   * (`pickedFeatIds`, read in the save's scope: the ids the view stands for them), granted by their class levels, or
   * granted at this one (`autoGrantedRecords`).
   */
  private checkNotTaken(
    feats: FeatRecord[],
    pickedFeatIds: string[],
    otherLevels: { klassLevelId: string }[],
    autoGrantedRecords: { featsInRule: { id: string } }[],
  ) {
    const existingFeatIds = new Set(pickedFeatIds);
    // The feats the other levels' class levels and this one grant, as the view composes them
    const grants = otherLevels.flatMap(
      (level) => this.rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(level.klassLevelId) ?? [],
    );
    for (const rec of [...grants, ...autoGrantedRecords]) existingFeatIds.add(rec.featsInRule.id);

    for (const feat of feats) {
      if (!feat.stackable && existingFeatIds.has(feat.id))
        throw new RulesError("invalid", `Non-stackable feat "${feat.name}" is already on this character`);
    }
  }

  /**
   * Throws when the level picks a non-stackable feat or a power more than once, in a pool or under two: a character
   * takes a non-stackable feat once, and a level knows a power once (one row a power). A stackable feat may be picked
   * again, at this level as at another: each pick is a row of its own.
   */
  private checkRepeatedPicks(
    feats: Record<string, string[]>,
    fetchedFeats: FeatRecord[],
    powers: Record<string, string[]>,
    fetchedPowers: PickRecord[],
  ) {
    const nonStackable = this.findRepeated(feats, fetchedFeats).find((feat) => !feat.stackable);
    if (nonStackable)
      throw new RulesError("invalid", `Non-stackable feat "${nonStackable.name}" cannot be picked more than once`);

    const [power] = this.findRepeated(powers, fetchedPowers);
    if (power) throw new RulesError("invalid", `Power "${power.name}" cannot be picked more than once at a level`);
  }

  /** The rows of these ids, deduplicated, from the character's ruleset; throws when one isn't in it. */
  private fetchAll<T>(ids: string[], byId: Map<string, T>, what: string): T[] {
    const uniqueIds = [...new Set(ids)];
    const fetched = uniqueIds.map((id) => byId.get(id)).filter((row): row is T => row !== undefined);
    if (fetched.length !== uniqueIds.length) throw new RulesError("invalid", `One or more ${what} not found`);
    return fetched;
  }

  /** The submitted skills, feats and powers, from the character's ruleset; throws when one, or a pool, isn't in it. */
  private fetchSelections(
    skills: Record<string, number>,
    feats: Record<string, string[]>,
    powers: Record<string, string[]>,
  ) {
    const { aptitudesById, featsById, powersById, skillsById } = this.rulesetData;
    const skillIds = Object.keys(skills).filter((id) => skills[id] > 0);
    const fetchedSkills = this.fetchAll(skillIds, skillsById, "skills");
    const fetchedFeats = this.fetchAll(Object.values(feats).flat(), featsById, "feats");
    const fetchedPowers = this.fetchAll(Object.values(powers).flat(), powersById, "powers");
    this.fetchAll([...Object.keys(feats), ...Object.keys(powers)], aptitudesById, "aptitudes");
    return { fetchedSkills, fetchedFeats, fetchedPowers };
  }

  /**
   * What's wrong with the ability increases of the level after `totalLevel` levels: none when they raise its abilities
   * by what its rules give it (none where they give none), each ability once.
   */
  private findAbilityIncreaseError(totalLevel: number, increases: AbilityIncrease[]) {
    const total = this.rules.getAbilityIncreaseTotal(totalLevel);
    if (increases.length > 0 && total === 0) return "Ability increase is not available at this level";
    if (increases.length === 0 && total > 0) return "Ability increase is required at this level";
    if (new Set(increases.map(({ abilityId }) => abilityId)).size < increases.length)
      return "An ability is increased twice at this level";
    if (increases.reduce((sum, { amount }) => sum + amount, 0) !== total)
      return `Ability increases must add up to ${total} at this level`;
    return undefined;
  }

  /** The picks (`fetched`) a level's selections (`picks`, by pool) give more than once, in a pool or under two. */
  private findRepeated<R extends PickRecord>(picks: Record<string, string[]>, fetched: R[]): R[] {
    const ids = Object.values(picks).flat();
    const repeated = new Set(ids.filter((id, index) => ids.indexOf(id) !== index));
    return fetched.filter(({ id }) => repeated.has(id));
  }

  /**
   * Whether the level after `totalLevel` levels raises its abilities by what its rules give it, as its save checks them
   * (`checkAbilityIncreases`): a level that takes none is picked with none.
   */
  areAbilityIncreasesPicked(totalLevel: number, increases: AbilityIncrease[]) {
    return this.findAbilityIncreaseError(totalLevel, increases) === undefined;
  }

  /**
   * Throws when the level after `totalLevel` levels raises its abilities by other than what its rules give it (none
   * where they give none), or raises one twice. `label` names the level in the message ("Level 2: ").
   */
  checkAbilityIncreases(totalLevel: number, increases: AbilityIncrease[], label = "") {
    const error = this.findAbilityIncreaseError(totalLevel, increases);
    if (error) throw new RulesError("invalid", `${label}${error}`);
  }

  /**
   * A level's selections checked (`checkLevelSelections`), then its non-stackable feats against those the character
   * already has: picked at its other levels (`pickedFeatIds`) or granted by their class levels (`otherLevels`).
   */
  checkLevel(level: LevelChecked, otherLevels: { klassLevelId: string }[], pickedFeatIds: string[]) {
    const { autoGrantedRecords, fetchedFeats } = this.checkLevelSelections(level);
    if (fetchedFeats.some((feat) => !feat.stackable))
      this.checkNotTaken(fetchedFeats, pickedFeatIds, otherLevels, autoGrantedRecords);
  }

  /** Throws when a submitted selection isn't the character's ruleset's, or isn't linked to the pool it's picked under. */
  checkSelections(skills: Record<string, number>, feats: Record<string, string[]>, powers: Record<string, string[]>) {
    this.fetchSelections(skills, feats, powers);
    this.checkLinks(feats, powers);
  }
}
