import type { OwnPicks } from "@/engine/rulesets/dnd5.2/model/aptitudes/AptitudesComponent.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd5.2/model/DetailedCharacter.ts";
import FeatRules from "@/engine/rulesets/dnd5.2/rules/FeatRules.ts";

import LevelUpBase, { type SavedLevelPicks } from "./LevelUpBase.ts";
import type { LevelPicks } from "./requests.ts";

/** A feat or a spell a level gives through a modifier, by name. */
interface GivenEntity {
  description: string | null;
  id: string;
  name: string;
}

/** The pools a character picks feats and spells in, and how many, with what a level-up plans. */
type LevelUpPools = ReturnType<DetailedCharacter["components"]["aptitudes"]["getLevelUpPools"]>;

/** A pool overfilled by a level-up's picks, as the character holding them says (`getOverfullPools`). */
type OverfullPool = ReturnType<DetailedCharacter["components"]["aptitudes"]["getOverfullPools"]>[number];

/**
 * What a level gives the character through its modifiers, past its class level's grants (`givenWith`): the feats and
 * the spells it then holds without a pick.
 */
export interface Given {
  feats: GivenEntity[];
  spells: GivenEntity[];
}

/** A planned level whose grants a step lists: its class level, and whether it's the character's first. */
export interface GrantingLevel {
  classLevelId: string;
  first: boolean;
}

/** A level-up's feats and spells, each by the pool it's picked in. */
export type PoolPicks = Pick<LevelPicks, "feats" | "spells">;

/**
 * What a D&D 5th Edition level-up flow reads past every flow's (`LevelUpBase`): the steps the wizard and the preview
 * share, a feats step and a spells step.
 */
export default abstract class LevelUpState extends LevelUpBase<DetailedCharacter> {
  /**
   * The picks without their latest in the overfull pool (`pool`), as many as it's over: of its spell level for a
   * leveled one's cantrips or a level past its room's (`level`), of any level its room takes for its room past cantrips
   * (`leveled`); in a shared one, its spells before its feats, the wizard's later step first.
   */
  private dropExcess(picks: PoolPicks, { aptitudeId, level, leveled, picked, room }: OverfullPool): PoolPicks {
    let excess = picked - room;
    const lookup = this.buildSpellLevelLookup(picks.spells[aptitudeId] ?? []);
    const spells = [...(picks.spells[aptitudeId] ?? [])];
    const dropped = (spellId: string) => {
      const spellLevel = lookup.get(`${spellId}:${aptitudeId}`);
      if (leveled) return spellLevel != null && spellLevel > 0;
      return String(spellLevel ?? "") === (level ?? "");
    };
    for (let i = spells.length - 1; i >= 0 && excess > 0; i--) {
      if (!dropped(spells[i])) continue;
      spells.splice(i, 1);
      excess--;
    }
    const unleveled = level === undefined && !leveled;
    const feats = unleveled ? (picks.feats[aptitudeId] ?? []).slice(0, -excess || undefined) : undefined;
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
    const rules = FeatRules.of(this.rulesetData);
    return {
      feats: this.dropRepeats(feats, (id) => rules.isStackable(id)),
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
   * (`pools`), in which pools, and the feats the planned levels (`levels`) grant, a class's first level its starting
   * proficiencies too, then those they give it through a modifier (`given`: a subclass's feature at its class level,
   * the saving throws a class's starting proficiencies give), each once.
   */
  protected featStep(pools: LevelUpPools, levels: GrantingLevel[], given: GivenEntity[] = []) {
    const granted: GivenEntity[] = levels.flatMap(({ classLevelId, first }) =>
      this.grantedFeatsAt(classLevelId, first),
    );
    const listed = new Set(granted.map(({ id }) => id));
    return {
      featsToSelect: pools.featsToSelect,
      autoGrantedFeats: [...granted, ...given.filter(({ id }) => !listed.has(id))],
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
   * What the character holds with a level or a level-up (`after`) that a modifier gave it and it didn't hold before
   * (`before`): the feats and the spells it holds without a pick, which the wizard lists with the levels' own grants.
   * A modifier gives one behind its requirements as the build applies it (a Champion's Additional Fighting Style at
   * Fighter 7), so a class level's grants alone don't name it.
   */
  protected givenWith(before: DetailedCharacter, after: DetailedCharacter): Given {
    const held = new Set(before.getVirtualFeats().map(({ id }) => id));
    const known = new Set(before.getVirtualSpells().map(({ aptitudeId, id }) => `${id}:${aptitudeId}`));
    return {
      feats: after.getVirtualFeats().filter(({ id }) => !held.has(id)),
      spells: after.getVirtualSpells().filter(({ aptitudeId, id }) => !known.has(`${id}:${aptitudeId}`)),
    };
  }

  /**
   * A spells step, the wizard's and the preview's alike: how many spells the character picks with what's planned
   * (`pools`), in which pools, and the spells the class levels (`classLevelIds`) grant, each saying whether it's free,
   * then those the levels make it know through a modifier (`given`), free, each once.
   */
  protected spellStep(pools: LevelUpPools, classLevelIds: string[], given: GivenEntity[] = []) {
    const { dnd52 } = this;
    const granted = classLevelIds.flatMap((id) =>
      dnd52.grantedSpellsOf(id).flatMap((grant) => {
        const spell = dnd52.spellsById.get(grant.toId);
        return spell ? [{ description: spell.description, free: grant.free, id: spell.id, name: spell.name }] : [];
      }),
    );
    const listed = new Set(granted.map(({ id }) => id));
    return {
      spellsToSelect: pools.spellsToSelect,
      autoGrantedSpells: [
        ...granted,
        ...given.filter(({ id }) => !listed.has(id)).map((spell) => ({ ...spell, free: true })),
      ],
      aptitudePools: pools.spellPools,
    };
  }
}
