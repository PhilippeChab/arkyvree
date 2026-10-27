import type { PickPlan, StoredPick } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import FeatRules from "@/engine/rulesets/dnd3.5/rules/FeatRules.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { type Klass } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import { CLASS_HD } from "@/vocabulary/dnd3.5/fields/index.ts";

import type { LevelUpRules } from "./LevelUpBase.ts";
import type { LevelPicks } from "./requests.ts";

/** An edited level's own saved feats and spells, each in its pool: the level's, whatever else holds them. */
interface KeptPicks {
  feats: StoredPick[];
  spells: StoredPick[];
}

/** The level's hit points and selections a check reads, with its class. */
interface LevelChecked {
  feats: Record<string, string[]>;
  hp: number;
  klass: Pick<Klass, "fields">;
  spells: Record<string, string[]>;
}

/**
 * A level's pick of a feat or a spell, in its pool, by its step (`feats` or `spells`), named for the order picks give
 * way in.
 */
interface LevelPick {
  entityId: string;
  name: string;
  step: "feats" | "spells";
  viaId: string;
}

/** A level's (or a level-up's) own feats and spells, each by the pool it's picked in. */
type PoolPicks = Pick<LevelPicks, "feats" | "spells">;

/**
 * A feat or a spell a character holds (`entity`), in the pool it holds it in (`viaId`: a spell's always), as a check
 * reads it: `given` when a modifier of the character's gives it, held by a pick or a grant too or not.
 */
export interface HeldEntity {
  entity: { id: string };
  given: boolean;
  viaId?: string;
}

/** A character whose feats and spells a check reads: what a level's picks are checked against. */
export interface HoldingCharacter {
  /** The feats the character has: picked, granted, or made possessed by its modifiers. */
  getHeldFeats(): HeldEntity[];
  /** The spells the character knows, each in its pool: picked, granted, or made known by its modifiers. */
  getHeldSpells(): HeldEntity[];
}

/**
 * The character with every level it has and plans, holding these of a level's (or a level-up's) own feats and spells
 * (`picks`, by pool) and none of the others: what a check reads off whether the character holds a pick already.
 */
export type Holding = (picks: PoolPicks) => HoldingCharacter;

/**
 * A level's selections checked against the ruleset's view (`view`): linked to their pools, and not taken twice (a
 * non-stackable feat the character has, a spell in a pool it knows it in, the level's other picks' gifts too); and its
 * hit points and ability increases, within what the level-up rules give it (`rules`). Each selection is the ruleset's,
 * by the id its view keys it by: the level-up handle resolved the request when it entered, and refused a pick the view
 * lacks (`LevelRequests`).
 */
export default class SelectionChecks {
  constructor(
    private readonly view: RulesetView,
    private readonly rules: Pick<LevelUpRules<unknown>, "getAbilityIncreaseTotal" | "hitPointsOf">,
  ) {
    this.feats = FeatRules.of(view.rulesetData);
  }

  /** The feat rules: which feats stack, and which the character can take again. */
  private readonly feats: FeatRules;

  /**
   * Throws when the level picks a non-stackable feat or a spell more than once, in a pool or under two: a character
   * takes a non-stackable feat once, and a level knows a spell once (one row a spell). A stackable feat may be picked
   * again, at this level as at another: each pick is a row of its own.
   */
  private checkRepeatedPicks(feats: Record<string, string[]>, spells: Record<string, string[]>) {
    const nonStackable = this.findRepeated(feats).find((featId) => !this.feats.isStackable(featId));
    if (nonStackable) {
      const name = this.dnd35.featsById.get(nonStackable)?.name ?? nonStackable;
      throw new RulesError("invalid", `Non-stackable feat "${name}" cannot be picked more than once`);
    }

    const [spell] = this.findRepeated(spells);
    if (!spell) return;
    const name = this.dnd35.spellsById.get(spell)?.name ?? spell;
    throw new RulesError("invalid", `Spell "${name}" cannot be picked more than once at a level`);
  }

  /** The view's 3.5 lists and indices. */
  private get dnd35(): Dnd35View {
    return Dnd35View.of(this.view.rulesetData);
  }

  /**
   * What's wrong with the ability increases of the level after `totalLevel` levels: none when they raise its abilities
   * by what its rules give it (none where they give none), each ability once.
   */
  private findAbilityIncreaseError(totalLevel: number, increases: PickPlan[]) {
    const total = this.rules.getAbilityIncreaseTotal(this.view, totalLevel);
    if (increases.length > 0 && total === 0) return "Ability increase is not available at this level";
    if (increases.length === 0 && total > 0) return "Ability increase is required at this level";
    if (new Set(increases.map(({ entityId }) => entityId)).size < increases.length)
      return "An ability is increased twice at this level";
    if (increases.reduce((sum, { amount }) => sum + amount!, 0) !== total)
      return `Ability increases must add up to ${total} at this level`;
    return undefined;
  }

  /**
   * The level's picks (`picks`, those the character holds no other way) a modifier gives, as the character holding them
   * all says (`holding`, read only when the level picks a feat that doesn't stack or a spell), in the order they give
   * way in: the last by name first, then by id. A pick the level holds already (`kept`) is its own, whatever gives it.
   */
  private findGivenPicks(picks: PoolPicks, holding: Holding, kept: KeptPicks): LevelPick[] {
    const ownFeats = new Set(kept.feats.map(({ entityId }) => entityId));
    const ownSpells = new Set(kept.spells.map(({ entityId, viaId }) => `${entityId}:${viaId}`));
    const { featsById, spellsById } = this.dnd35;
    const picked = [
      ...this.listPicks("feats", picks.feats, featsById).filter(
        ({ entityId }) => !this.feats.isStackable(entityId) && !ownFeats.has(entityId),
      ),
      ...this.listPicks("spells", picks.spells, spellsById).filter(
        ({ entityId, viaId }) => !ownSpells.has(`${entityId}:${viaId}`),
      ),
    ];
    if (picked.length === 0) return [];
    const character = holding(picks);
    return picked
      .filter((pick) => this.findHeld(character, pick).some(({ given }) => given))
      .sort((a, b) => b.name.localeCompare(a.name) || b.entityId.localeCompare(a.entityId));
  }

  /** What the character holds a pick by: the feat's entries, or the spell's in its pool. */
  private findHeld(character: HoldingCharacter, { entityId, step, viaId }: LevelPick): HeldEntity[] {
    if (step === "feats") return character.getHeldFeats().filter(({ entity }) => entity.id === entityId);
    return character.getHeldSpells().filter((spell) => spell.entity.id === entityId && spell.viaId === viaId);
  }

  /** The ids a level's selections (`picks`, by pool) give more than once, in a pool or under two, each once. */
  private findRepeated(picks: Record<string, string[]>) {
    const ids = Object.values(picks).flat();
    const repeated = new Set(ids.filter((id, index) => ids.indexOf(id) !== index));
    return [...new Set(ids)].filter((id) => repeated.has(id));
  }

  /** A pool's picks of a step (`picks`, by pool) as the level's picks, each named by its row (`byId`). */
  private listPicks(step: LevelPick["step"], picks: Record<string, string[]>, byId: Map<string, { name: string }>) {
    return Object.entries(picks).flatMap(([viaId, ids]) =>
      ids.map((entityId): LevelPick => ({ entityId, name: byId.get(entityId)?.name ?? entityId, step, viaId })),
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
      const ids = fresh[pick.step][pick.viaId];
      const without = {
        ...fresh,
        [pick.step]: { ...fresh[pick.step], [pick.viaId]: ids.toSpliced(ids.indexOf(pick.entityId), 1) },
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
  private splitHeldFeats(feats: Record<string, string[]>, held: () => HeldEntity[], kept: StoredPick[]) {
    const repeated: PickPlan[] = [];
    const picked = Object.values(feats).flat();
    if (picked.every((featId) => this.feats.isStackable(featId))) return { fresh: feats, repeated };
    const seen = new Set(held().map(({ entity }) => entity.id));
    const own = new Set(kept.map(({ entityId }) => entityId));
    const fresh: Record<string, string[]> = {};
    for (const [viaId, ids] of Object.entries(feats)) {
      fresh[viaId] = [];
      for (const featId of ids) {
        if (!this.feats.canTake(featId, seen) && !own.has(featId))
          repeated.push({ step: "feats", entityId: featId, viaId });
        else fresh[viaId].push(featId);
        seen.add(featId);
      }
    }
    return { fresh, repeated };
  }

  /**
   * A level's (or a level-up's) own feats and spells (`picks`, by pool, each pool's in its order) split by whether the
   * character holds them already, as `holding` builds it with some of them: a feat that doesn't stack it has, held with
   * the level's spells (`splitHeldFeats`); a spell it knows in its pool, known with the feats it keeps
   * (`splitKnownSpells`); then a pick of either the level's other picks give (`splitGivenPicks`). A pick the level holds
   * already (`kept`, an edited level's saved picks) is its own, whatever else holds it. What the level keeps of them
   * (`fresh`), and what gives way (`refused`), each kind's in that order.
   */
  private splitHeldPicks(picks: PoolPicks, holding: Holding, kept: KeptPicks = { feats: [], spells: [] }) {
    const held = () => holding({ feats: {}, spells: picks.spells }).getHeldFeats();
    const feats = this.splitHeldFeats(picks.feats, held, kept.feats);
    const known = () => holding({ feats: feats.fresh, spells: {} }).getHeldSpells();
    const spells = this.splitKnownSpells(picks.spells, known, kept.spells);
    const { fresh, given } = this.splitGivenPicks({ feats: feats.fresh, spells: spells.fresh }, holding, kept);
    const givenOf = (step: LevelPick["step"]) =>
      given.filter((pick) => pick.step === step).map(({ entityId, viaId }): PickPlan => ({ step, entityId, viaId }));
    return {
      fresh,
      refused: { feats: [...feats.repeated, ...givenOf("feats")], spells: [...spells.repeated, ...givenOf("spells")] },
    };
  }

  /**
   * A level's spells (`spells`, by pool, each pool's in its order) split by whether the character knows them in their
   * pool already: held there (`known`, read only when the level picks any: picked at its other levels, granted, or made
   * known by its modifiers), or picked there before them. A character knows a spell once in a pool, and may know it in
   * another. A pick the level holds already (`kept`, an edited level's saved picks) is its own, whatever else knows it.
   */
  private splitKnownSpells(spells: Record<string, string[]>, known: () => HeldEntity[], kept: StoredPick[]) {
    const repeated: PickPlan[] = [];
    if (Object.values(spells).every((ids) => ids.length === 0)) return { fresh: spells, repeated };
    const keyOf = (viaId: string, spellId: string) => `${spellId}:${viaId}`;
    const seen = new Set(known().map(({ entity, viaId }) => keyOf(viaId!, entity.id)));
    const own = new Set(kept.map(({ entityId, viaId }) => keyOf(viaId!, entityId!)));
    const fresh: Record<string, string[]> = {};
    for (const [viaId, ids] of Object.entries(spells)) {
      fresh[viaId] = [];
      for (const spellId of ids) {
        const key = keyOf(viaId, spellId);
        if (seen.has(key) && !own.has(key)) repeated.push({ step: "spells", entityId: spellId, viaId });
        else fresh[viaId].push(spellId);
        seen.add(key);
      }
    }
    return { fresh, repeated };
  }

  /**
   * Whether the level after `totalLevel` levels raises its abilities by what its rules give it, as its save checks them
   * (`checkAbilityIncreases`): a level that takes none is picked with none.
   */
  areAbilityIncreasesPicked(totalLevel: number, increases: PickPlan[]) {
    return this.findAbilityIncreaseError(totalLevel, increases) === undefined;
  }

  /**
   * Throws when the level after `totalLevel` levels raises its abilities by other than what its rules give it (none
   * where they give none), or raises one twice. `label` names the level in the message ("Level 2: ").
   */
  checkAbilityIncreases(totalLevel: number, increases: PickPlan[], label = "") {
    const error = this.findAbilityIncreaseError(totalLevel, increases);
    if (error) throw new RulesError("invalid", `${label}${error}`);
  }

  /**
   * A level's hit points and selections checked, for both the level save and the level-up's: each selection linked to
   * its pool, no non-stackable feat or spell picked twice. Whether the character holds what it picks already is the
   * save's next check (`checkPicksNotHeld`).
   */
  checkLevel({ klass, hp, feats, spells }: LevelChecked) {
    const { max, min } = this.rules.hitPointsOf(klass.fields[CLASS_HD]);
    if (hp < min || hp > max) throw new RulesError("invalid", `HP must be between ${min} and ${max}`);

    // Submitted ids can repeat, in a pool or under two: a stackable feat's may, checkRepeatedPicks refuses the others.
    this.checkRepeatedPicks(feats, spells);
    this.checkLinks(feats, spells);
  }

  /**
   * Throws when a feat or a spell isn't linked to the pool it's picked under, each named in its rules' word: "Feat is
   * not linked to the specified aptitude".
   */
  checkLinks(feats: Record<string, string[]>, spells: Record<string, string[]>) {
    const { rulesetData } = this.view;
    const pool = rulesetData.labelOf("aptitudes").toLowerCase();
    for (const [type, picks, byId] of [
      ["feats", feats, this.dnd35.featsById],
      ["spells", spells, this.dnd35.spellsById],
    ] as const) {
      for (const [aptitudeId, ids] of Object.entries(picks)) {
        for (const id of ids) {
          const links = byId.has(id) ? this.dnd35.listLinksOf(id) : [];
          if (!links.some((link) => link.toId === aptitudeId))
            throw new RulesError("invalid", `${rulesetData.labelOf(type)} is not linked to the specified ${pool}`);
        }
      }
    }
  }

  /**
   * Throws when a level (or a level-up) picks what the character holds already, as `holding` builds it with some of its
   * picks (`splitHeldPicks`), forced or not: a feat that doesn't stack it has, naming the feat, or a spell it knows in
   * its pool, naming the spell and the pool; held at another level, granted, made possessed or known by a modifier,
   * picked earlier in the level-up, or given by the level's other picks. A pick the level holds already (`kept`, an
   * edited level's saved picks) stays, a repeat saved before too. A feat that stacks, or a spell known in another pool,
   * is the level's to pick.
   */
  checkPicksNotHeld(picks: PoolPicks, holding: Holding, kept?: KeptPicks) {
    const { feats, spells } = this.splitHeldPicks(picks, holding, kept).refused;
    const [feat] = feats;
    if (feat) {
      const name = this.dnd35.featsById.get(feat.entityId!)?.name ?? feat.entityId;
      throw new RulesError("invalid", `Non-stackable feat "${name}" is already on this character`);
    }
    const [spell] = spells;
    if (!spell) return;
    const name = this.dnd35.spellsById.get(spell.entityId!)?.name ?? spell.entityId;
    const pool = this.dnd35.aptitudesById.get(spell.viaId!)?.name ?? spell.viaId;
    throw new RulesError("invalid", `Spell "${name}" is already known in ${pool}`);
  }

  /**
   * A level's (or a level-up's) own feats and spells (`picks`, by pool) but those the character holds already, as a save
   * refuses them (`checkPicksNotHeld`): what the save takes of them, which a preview fits.
   */
  withoutHeldPicks(picks: PoolPicks, holding: Holding, kept?: KeptPicks) {
    return this.splitHeldPicks(picks, holding, kept).fresh;
  }
}
