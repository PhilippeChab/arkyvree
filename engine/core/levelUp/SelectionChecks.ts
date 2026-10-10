import type { AbilityIncrease, FeatPick, PowerPick } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";

import type { LevelUpRules } from "./LevelUpBase.ts";

interface FeatRecord extends PickRecord {
  stackable: boolean;
}

/** The level's hit points, ability increases and selections a check reads, with its class. */
interface LevelChecked {
  abilityIncreases: AbilityIncrease[];
  feats: Record<string, string[]>;
  hp: number;
  klass: { hd: number };
  powers: Record<string, string[]>;
  skills: Record<string, number>;
}

/** A feat or a power picked, as the check names it. */
interface PickRecord {
  id: string;
  name: string;
}

/** A feat a character holds, as the character holds it. */
export interface HeldFeat {
  id: string;
}

/** A power a character knows, in the pool it knows it in, as the character holds it. */
export interface KnownPower {
  aptitudeId: string;
  id: string;
}

/** A class level's granted feats, as the view joins them to their feats. */
export type GrantedFeatRecords =
  RulesetData["klassLevelFeatsWithFeatsByKlassLevel"] extends Map<string, infer R> ? R : never;

/**
 * A level's selections checked against the ruleset (`rulesetData`): theirs, linked to their pools, and not taken twice
 * (a non-stackable feat the character has, a power in a pool it knows it in); and its hit points and ability
 * increases, within what its ruleset's rules give it (`rules`).
 */
export default class SelectionChecks {
  constructor(
    private readonly rulesetData: RulesetData,
    private readonly rules: Pick<LevelUpRules<unknown>, "getAbilityIncreaseTotal" | "hitPointsOf">,
  ) {}

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
   * A level's feats (`feats`, by pool, each pool's in its order) split by whether the character has those that don't
   * stack already: held (`held`, read only when the level picks one: picked at its other levels, granted, or made
   * possessed by its modifiers), or picked before them, in a pool or under another. A character has a feat that doesn't
   * stack once; one that stacks is the level's to pick again. A pick the level holds already (`kept`, an edited level's
   * saved picks) is its own, whatever else holds it.
   */
  private splitHeldFeats(feats: Record<string, string[]>, held: () => HeldFeat[], kept: FeatPick[]) {
    const repeated: FeatPick[] = [];
    const stacks = (featId: string) => this.rulesetData.featsById.get(featId)?.stackable === true;
    if (Object.values(feats).flat().every(stacks)) return { fresh: feats, repeated };
    const seen = new Set(held().map(({ id }) => id));
    const own = new Set(kept.map(({ featId }) => featId));
    const fresh: Record<string, string[]> = {};
    for (const [aptitudeId, ids] of Object.entries(feats)) {
      fresh[aptitudeId] = [];
      for (const featId of ids) {
        if (!stacks(featId) && seen.has(featId) && !own.has(featId)) repeated.push({ aptitudeId, featId });
        else fresh[aptitudeId].push(featId);
        seen.add(featId);
      }
    }
    return { fresh, repeated };
  }

  /**
   * A level's powers (`powers`, by pool, each pool's in its order) split by whether the character knows them in their
   * pool already: held there (`known`, read only when the level picks any: picked at its other levels, granted, or made
   * known by its modifiers), or picked there before them. A character knows a power once in a pool, and may know it in
   * another. A pick the level holds already (`kept`, an edited level's saved picks) is its own, whatever else knows it.
   */
  private splitKnownPowers(powers: Record<string, string[]>, known: () => KnownPower[], kept: PowerPick[]) {
    const repeated: PowerPick[] = [];
    if (Object.values(powers).every((ids) => ids.length === 0)) return { fresh: powers, repeated };
    const keyOf = (aptitudeId: string, powerId: string) => `${powerId}:${aptitudeId}`;
    const seen = new Set(known().map(({ aptitudeId, id }) => keyOf(aptitudeId, id)));
    const own = new Set(kept.map(({ aptitudeId, powerId }) => keyOf(aptitudeId, powerId)));
    const fresh: Record<string, string[]> = {};
    for (const [aptitudeId, ids] of Object.entries(powers)) {
      fresh[aptitudeId] = [];
      for (const powerId of ids) {
        const key = keyOf(aptitudeId, powerId);
        if (seen.has(key) && !own.has(key)) repeated.push({ aptitudeId, powerId });
        else fresh[aptitudeId].push(powerId);
        seen.add(key);
      }
    }
    return { fresh, repeated };
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
   * Throws when a level picks a feat that doesn't stack the character has already (`held`, read only when it picks one:
   * picked at another level, granted, or made possessed by a modifier), or picks it earlier in the level-up, naming the
   * feat: but a pick the level holds already (`kept`, an edited level's saved picks), so one saved before stays. A feat
   * that stacks is the level's to pick again.
   */
  checkFeatsNotHeld(feats: Record<string, string[]>, held: () => HeldFeat[], kept: FeatPick[] = []) {
    const [repeated] = this.splitHeldFeats(feats, held, kept).repeated;
    if (!repeated) return;
    const feat = this.rulesetData.featsById.get(repeated.featId)?.name ?? repeated.featId;
    throw new RulesError("invalid", `Non-stackable feat "${feat}" is already on this character`);
  }

  /**
   * A level's hit points, ability increases and selections checked, for both the level save and the level-up's: each
   * ability and selection the ruleset's, each selection linked to its pool, no non-stackable feat or power picked twice.
   * Whether the character has a feat it picks already is the save's next check (`checkFeatsNotHeld`).
   */
  checkLevel({ klass, hp, abilityIncreases, skills, feats, powers }: LevelChecked) {
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
  }

  /**
   * Throws when a level picks a power in a pool where the character knows it already (`known`, read only when it picks
   * any), or picks it there twice, naming the power and the pool: but a pick the level holds already (`kept`, an edited
   * level's saved picks), so a repeat saved before stays. A power known in another pool is the level's to pick.
   */
  checkPowersNotKnown(powers: Record<string, string[]>, known: () => KnownPower[], kept: PowerPick[] = []) {
    const [repeated] = this.splitKnownPowers(powers, known, kept).repeated;
    if (!repeated) return;
    const power = this.rulesetData.powersById.get(repeated.powerId)?.name ?? repeated.powerId;
    const pool = this.rulesetData.aptitudesById.get(repeated.aptitudeId)?.name ?? repeated.aptitudeId;
    throw new RulesError("invalid", `Power "${power}" is already known in ${pool}`);
  }

  /** Throws when a submitted selection isn't the character's ruleset's, or isn't linked to the pool it's picked under. */
  checkSelections(skills: Record<string, number>, feats: Record<string, string[]>, powers: Record<string, string[]>) {
    this.fetchSelections(skills, feats, powers);
    this.checkLinks(feats, powers);
  }

  /**
   * A level's feats (`feats`, by pool) but those that don't stack the character has already, as a save refuses them
   * (`checkFeatsNotHeld`): what the save takes of them, which a preview fits.
   */
  withoutHeldFeats(feats: Record<string, string[]>, held: () => HeldFeat[], kept: FeatPick[] = []) {
    return this.splitHeldFeats(feats, held, kept).fresh;
  }

  /**
   * A level's powers (`powers`, by pool) but those the character knows in their pool already, as a save refuses them
   * (`checkPowersNotKnown`): what the save takes of them, which a preview fits.
   */
  withoutKnownPowers(powers: Record<string, string[]>, known: () => KnownPower[], kept: PowerPick[] = []) {
    return this.splitKnownPowers(powers, known, kept).fresh;
  }
}
