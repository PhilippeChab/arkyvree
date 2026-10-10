import type { AbilityIncrease, FeatPick, LevelPickRows, LevelPicks, PowerPick } from "@/engine/core/module/index.ts";
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

/** A level's pick of either kind, in its pool: a feat or a power, named for the order picks give way in. */
interface LevelPick {
  aptitudeId: string;
  id: string;
  kind: "feats" | "powers";
  name: string;
}

/** A feat or a power picked, as the check names it. */
interface PickRecord {
  id: string;
  name: string;
}

/** An edited level's own saved feats and powers, each in its pool: the level's, whatever else holds them. */
type KeptPicks = Pick<LevelPickRows, "feats" | "powers">;

/** A level's (or a level-up's) own feats and powers, each by the pool it's picked in. */
type PoolPicks = Pick<LevelPicks, "feats" | "powers">;

/**
 * A feat a character holds, as the character holds it: `given` when a modifier of the character's gives it, held by a
 * pick or a grant too or not.
 */
export interface HeldFeat {
  given?: boolean;
  id: string;
}

/** A character whose feats and powers a check reads: what a level's picks are checked against. */
export interface HoldingCharacter {
  /** The feats the character has: picked, granted, or made possessed by its modifiers. */
  getHeldFeats(): HeldFeat[];
  /** The powers the character knows, each in its pool: picked, granted, or made known by its modifiers. */
  getHeldPowers(): KnownPower[];
}

/**
 * A power a character knows, in the pool it knows it in, as the character holds it: `given` when a modifier of the
 * character's makes it known there, held by a pick or a grant too or not.
 */
export interface KnownPower {
  aptitudeId: string;
  given?: boolean;
  id: string;
}

/** A class level's granted feats, as the view joins them to their feats. */
export type GrantedFeatRecords =
  RulesetData["klassLevelFeatsWithFeatsByKlassLevel"] extends Map<string, infer R> ? R : never;

/**
 * The character with every level it has and plans, holding these of a level's (or a level-up's) own feats and powers
 * (`picks`, by pool) and none of the others: what a check reads off whether the character holds a pick already.
 */
export type Holding = (picks: PoolPicks) => HoldingCharacter;

/**
 * A level's selections checked against the ruleset (`rulesetData`): theirs, linked to their pools, and not taken twice
 * (a non-stackable feat the character has, a power in a pool it knows it in, the level's other picks' gifts too); and
 * its hit points and ability increases, within what its ruleset's rules give it (`rules`).
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

  /**
   * The level's picks (`picks`, those the character holds no other way) a modifier gives, as the character holding them
   * all says (`holding`, read only when the level picks a feat that doesn't stack or a power), in the order they give
   * way in: the last by name first, then by id. A pick the level holds already (`kept`) is its own, whatever gives it.
   */
  private findGivenPicks(picks: PoolPicks, holding: Holding, kept: KeptPicks): LevelPick[] {
    const ownFeats = new Set(kept.feats.map(({ featId }) => featId));
    const ownPowers = new Set(kept.powers.map(({ aptitudeId, powerId }) => `${powerId}:${aptitudeId}`));
    const { featsById, powersById } = this.rulesetData;
    const picked = [
      ...this.listPicks("feats", picks.feats, featsById).filter(({ id }) => !this.isStackable(id) && !ownFeats.has(id)),
      ...this.listPicks("powers", picks.powers, powersById).filter(
        ({ aptitudeId, id }) => !ownPowers.has(`${id}:${aptitudeId}`),
      ),
    ];
    if (picked.length === 0) return [];
    const character = holding(picks);
    return picked
      .filter((pick) => this.findHeld(character, pick).some(({ given }) => given))
      .sort((a, b) => b.name.localeCompare(a.name) || b.id.localeCompare(a.id));
  }

  /** What the character holds a pick by: the feat's entries, or the power's in its pool. */
  private findHeld(character: HoldingCharacter, { aptitudeId, id, kind }: LevelPick): (HeldFeat | KnownPower)[] {
    if (kind === "feats") return character.getHeldFeats().filter((feat) => feat.id === id);
    return character.getHeldPowers().filter((power) => power.id === id && power.aptitudeId === aptitudeId);
  }

  /** The picks (`fetched`) a level's selections (`picks`, by pool) give more than once, in a pool or under two. */
  private findRepeated<R extends PickRecord>(picks: Record<string, string[]>, fetched: R[]): R[] {
    const ids = Object.values(picks).flat();
    const repeated = new Set(ids.filter((id, index) => ids.indexOf(id) !== index));
    return fetched.filter(({ id }) => repeated.has(id));
  }

  /** Whether the ruleset's feat stacks: a character may have it more than once. */
  private isStackable(featId: string) {
    return this.rulesetData.featsById.get(featId)?.stackable === true;
  }

  /** A pool's picks of a kind (`picks`, by pool) as the level's picks, each named by its row (`byId`). */
  private listPicks(kind: LevelPick["kind"], picks: Record<string, string[]>, byId: Map<string, { name: string }>) {
    return Object.entries(picks).flatMap(([aptitudeId, ids]) =>
      ids.map((id): LevelPick => ({ aptitudeId, id, kind, name: byId.get(id)?.name ?? id })),
    );
  }

  /**
   * The level's picks (`picks`, those the character holds no other way) split by whether its other picks give them: one
   * a modifier gives (`findGivenPicks`) gives way when the character without it holds it all the same (`holding`,
   * without the picks given way before it too), and the pick that gives it stays, whatever order they were picked in.
   * Of two picks that each give the other, the one whose name comes first stays.
   */
  private splitGivenPicks(picks: PoolPicks, holding: Holding, kept: KeptPicks) {
    let fresh = picks;
    const given: LevelPick[] = [];
    for (const pick of this.findGivenPicks(picks, holding, kept)) {
      const ids = fresh[pick.kind][pick.aptitudeId];
      const without = {
        ...fresh,
        [pick.kind]: { ...fresh[pick.kind], [pick.aptitudeId]: ids.toSpliced(ids.indexOf(pick.id), 1) },
      };
      if (this.findHeld(holding(without), pick).length === 0) continue;
      fresh = without;
      given.push(pick);
    }
    return { fresh, given };
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
    const picked = Object.values(feats).flat();
    if (picked.every((featId) => this.isStackable(featId))) return { fresh: feats, repeated };
    const seen = new Set(held().map(({ id }) => id));
    const own = new Set(kept.map(({ featId }) => featId));
    const fresh: Record<string, string[]> = {};
    for (const [aptitudeId, ids] of Object.entries(feats)) {
      fresh[aptitudeId] = [];
      for (const featId of ids) {
        if (!this.isStackable(featId) && seen.has(featId) && !own.has(featId)) repeated.push({ aptitudeId, featId });
        else fresh[aptitudeId].push(featId);
        seen.add(featId);
      }
    }
    return { fresh, repeated };
  }

  /**
   * A level's (or a level-up's) own feats and powers (`picks`, by pool, each pool's in its order) split by whether the
   * character holds them already, as `holding` builds it with some of them: a feat that doesn't stack it has, held with
   * the level's powers (`splitHeldFeats`); a power it knows in its pool, known with the feats it keeps
   * (`splitKnownPowers`); then a pick of either the level's other picks give (`splitGivenPicks`). A pick the level holds
   * already (`kept`, an edited level's saved picks) is its own, whatever else holds it. What the level keeps of them
   * (`fresh`), and what gives way (`refused`), each kind's in that order.
   */
  private splitHeldPicks(picks: PoolPicks, holding: Holding, kept: KeptPicks = { feats: [], powers: [] }) {
    const held = () => holding({ feats: {}, powers: picks.powers }).getHeldFeats();
    const feats = this.splitHeldFeats(picks.feats, held, kept.feats);
    const known = () => holding({ feats: feats.fresh, powers: {} }).getHeldPowers();
    const powers = this.splitKnownPowers(picks.powers, known, kept.powers);
    const { fresh, given } = this.splitGivenPicks({ feats: feats.fresh, powers: powers.fresh }, holding, kept);
    const givenOf = (kind: LevelPick["kind"]) => given.filter((pick) => pick.kind === kind);
    return {
      fresh,
      refused: {
        feats: [...feats.repeated, ...givenOf("feats").map(({ aptitudeId, id }) => ({ aptitudeId, featId: id }))],
        powers: [...powers.repeated, ...givenOf("powers").map(({ aptitudeId, id }) => ({ aptitudeId, powerId: id }))],
      },
    };
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
   * A level's hit points, ability increases and selections checked, for both the level save and the level-up's: each
   * ability and selection the ruleset's, each selection linked to its pool, no non-stackable feat or power picked twice.
   * Whether the character holds what it picks already is the save's next check (`checkPicksNotHeld`).
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
   * Throws when a level (or a level-up) picks what the character holds already, as `holding` builds it with some of its
   * picks (`splitHeldPicks`), forced or not: a feat that doesn't stack it has, naming the feat, or a power it knows in
   * its pool, naming the power and the pool; held at another level, granted, made possessed or known by a modifier,
   * picked earlier in the level-up, or given by the level's other picks. A pick the level holds already (`kept`, an
   * edited level's saved picks) stays, a repeat saved before too. A feat that stacks, or a power known in another pool,
   * is the level's to pick.
   */
  checkPicksNotHeld(picks: PoolPicks, holding: Holding, kept?: KeptPicks) {
    const { feats, powers } = this.splitHeldPicks(picks, holding, kept).refused;
    const [feat] = feats;
    if (feat) {
      const name = this.rulesetData.featsById.get(feat.featId)?.name ?? feat.featId;
      throw new RulesError("invalid", `Non-stackable feat "${name}" is already on this character`);
    }
    const [power] = powers;
    if (!power) return;
    const name = this.rulesetData.powersById.get(power.powerId)?.name ?? power.powerId;
    const pool = this.rulesetData.aptitudesById.get(power.aptitudeId)?.name ?? power.aptitudeId;
    throw new RulesError("invalid", `Power "${name}" is already known in ${pool}`);
  }

  /** Throws when a submitted selection isn't the character's ruleset's, or isn't linked to the pool it's picked under. */
  checkSelections(skills: Record<string, number>, feats: Record<string, string[]>, powers: Record<string, string[]>) {
    this.fetchSelections(skills, feats, powers);
    this.checkLinks(feats, powers);
  }

  /**
   * A level's (or a level-up's) own feats and powers (`picks`, by pool) but those the character holds already, as a save
   * refuses them (`checkPicksNotHeld`): what the save takes of them, which a preview fits.
   */
  withoutHeldPicks(picks: PoolPicks, holding: Holding, kept?: KeptPicks) {
    return this.splitHeldPicks(picks, holding, kept).fresh;
  }
}
