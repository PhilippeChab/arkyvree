import type { ViewLink } from "@/engine/core/view/index.ts";
import type { OwnPicks } from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudesComponent.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import SkillRules from "@/engine/rulesets/dnd3.5/rules/SkillRules.ts";
import { include } from "@/lib/mixins.ts";
import { FEAT_STACKABLE } from "@/vocabulary/dnd3.5/fields/index.ts";

import { SpendsSkillPoints } from "./concerns/SpendsSkillPoints.ts";
import LevelUpBase, { type SavedLevelPicks } from "./LevelUpBase.ts";
import type { LevelPicks } from "./requests.ts";

/** The pools a character picks feats and spells in, and how many, with what a level-up plans. */
type LevelUpPools = ReturnType<DetailedCharacter["components"]["aptitudes"]["getLevelUpPools"]>;

/** A pool overfilled by a level-up's picks, as the character holding them says (`getOverfullPools`). */
type OverfullPool = ReturnType<DetailedCharacter["components"]["aptitudes"]["getOverfullPools"]>[number];

/** A level-up's feats and spells, each by the pool it's picked in. */
export type PoolPicks = Pick<LevelPicks, "feats" | "spells">;

/**
 * What a 3.5 level-up flow reads past every flow's (`LevelUpBase`): the steps the wizard and the preview share, a feats
 * step, a spells step and a skills step (`SpendsSkillPoints`), and which skills a class makes class skills.
 */
export default abstract class LevelUpState extends include(LevelUpBase<DetailedCharacter>, SpendsSkillPoints) {
  /**
   * The picks without their latest in the overfull pool (`pool`), as many as it's over: at its spell level for a leveled
   * one; in a shared one, its spells before its feats, the wizard's later step first.
   */
  private dropExcess(picks: PoolPicks, { aptitudeId, level, picked, room }: OverfullPool): PoolPicks {
    let excess = picked - room;
    const lookup = this.buildSpellLevelLookup(picks.spells[aptitudeId] ?? []);
    const spells = [...(picks.spells[aptitudeId] ?? [])];
    for (let i = spells.length - 1; i >= 0 && excess > 0; i--) {
      if (String(lookup.get(`${spells[i]}:${aptitudeId}`) ?? "") !== (level ?? "")) continue;
      spells.splice(i, 1);
      excess--;
    }
    const feats = level === undefined ? (picks.feats[aptitudeId] ?? []).slice(0, -excess || undefined) : undefined;
    return {
      feats: feats ? { ...picks.feats, [aptitudeId]: feats } : picks.feats,
      spells: { ...picks.spells, [aptitudeId]: spells },
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
   * non-stackable feat or a spell given again in its pool once, since a character takes a non-stackable feat once and
   * knows a spell once (a save refuses either picked twice at a level).
   */
  private keepTakenPicks({ feats = {}, spells = {} }: Partial<PoolPicks>): PoolPicks {
    return {
      feats: this.dropRepeats(feats, (id) => this.dnd35.featsById.get(id)?.fields[FEAT_STACKABLE] === true),
      spells: this.dropRepeats(spells, () => false),
    };
  }

  /**
   * A level-up's own picks, counted by pool (`OwnPicks`): its feats, and its spells by their spell level there, as a
   * save takes them (`keepTakenPicks`): a stackable feat each time, a repeat of the others once.
   */
  protected countOwnPicks(picks: Partial<PoolPicks>): OwnPicks {
    const { feats, spells } = this.keepTakenPicks(picks);
    const lookup = this.buildSpellLevelLookup(Object.values(spells).flat());
    const spellCounts: OwnPicks["spells"] = {};
    for (const [aptitudeId, ids] of Object.entries(spells)) {
      const counts: Record<string, number> = {};
      for (const spellId of ids) {
        const level = String(lookup.get(`${spellId}:${aptitudeId}`) ?? "");
        counts[level] = (counts[level] ?? 0) + 1;
      }
      spellCounts[aptitudeId] = counts;
    }
    const featCounts = Object.entries(feats).map(([aptitudeId, ids]) => [aptitudeId, ids.length]);
    return { feats: Object.fromEntries(featCounts), spells: spellCounts };
  }

  /**
   * A feats step, the wizard's and the preview's alike: how many feats the character picks with what's planned
   * (`pools`), in which pools, and the feats the class levels (`klassLevelIds`) grant.
   */
  protected featStep(pools: LevelUpPools, klassLevelIds: string[]) {
    const { dnd35 } = this;
    return {
      featsToSelect: pools.featsToSelect,
      autoGrantedFeats: klassLevelIds.flatMap((id) =>
        dnd35.grantedFeatsOf(id).flatMap((grant) => dnd35.featsById.get(grant.toId) ?? []),
      ),
      aptitudePools: pools.featPools,
    };
  }

  /**
   * The picks that fit their pools (`picks`, each pool's in its order), and the character holding them (`build`): those
   * a save takes (`keepTakenPicks`) but those the character holds already, as a save refuses them (`withoutHeldPicks`:
   * a feat that doesn't stack it has, a spell it knows in its pool, the level's other picks' gifts too; an edited
   * level's own saved picks, `kept`, stay), then the latest picks of an overfull pool dropped, and the character built
   * again, until none is (a feat dropped takes the room it gave). What the wizard keeps of its picks, as a save would
   * take them.
   */
  protected fitPicks(
    picks: Partial<PoolPicks>,
    build: (picks: PoolPicks) => DetailedCharacter,
    kept?: Pick<SavedLevelPicks, "feats" | "spells">,
  ) {
    const holding = this.buildOnce(build);
    let fitted = this.checks.withoutHeldPicks(this.keepTakenPicks(picks), holding, kept);
    for (;;) {
      const character = holding(fitted);
      const [overfull] = character.components.aptitudes.getOverfullPools(this.countOwnPicks(fitted));
      if (!overfull) return { character, picks: fitted };
      fitted = this.dropExcess(fitted, overfull);
    }
  }

  /**
   * The skills class skill links (`links`, `classSkill`) make class skills: theirs the view shows, and the ruleset's
   * subtypes of them ("Craft (…)" of Craft).
   */
  protected getClassSkillIds(links: readonly ViewLink[]): Set<string> {
    const skills = links.flatMap((link) => this.dnd35.skillsById.get(link.toId) ?? []);
    const ids = new Set(skills.map((skill) => skill.id));
    const names = new Set(skills.map((skill) => skill.name));
    for (const skill of this.dnd35.skills) if (SkillRules.isSubtypeOf(skill.name, names)) ids.add(skill.id);

    return ids;
  }

  /**
   * A spells step, the wizard's and the preview's alike: how many spells the character picks with what's planned
   * (`pools`), in which pools, and the spells the class levels (`klassLevelIds`) grant, each saying whether it's free.
   */
  protected spellStep(pools: LevelUpPools, klassLevelIds: string[]) {
    const { dnd35 } = this;
    return {
      spellsToSelect: pools.spellsToSelect,
      autoGrantedSpells: klassLevelIds.flatMap((id) =>
        dnd35.grantedSpellsOf(id).flatMap((grant) => {
          const spell = dnd35.spellsById.get(grant.toId);
          return spell ? [{ ...spell, free: grant.free }] : [];
        }),
      ),
      aptitudePools: pools.spellPools,
    };
  }
}
