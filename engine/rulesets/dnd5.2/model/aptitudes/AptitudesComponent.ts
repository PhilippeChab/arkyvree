import { CharacterComponent } from "@/engine/core/character/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type ClassesComponent from "@/engine/rulesets/dnd5.2/model/classes/ClassesComponent.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd5.2/model/loading/DetailedCharacterDataLoader.ts";
import SpellLists from "@/engine/rulesets/dnd5.2/rules/SpellLists.ts";
import Dnd52View from "@/engine/rulesets/dnd5.2/view/Dnd52View.ts";
import type { Aptitude } from "@/engine/rulesets/dnd5.2/view/rows.ts";
import { stripSeparators } from "@/shared/text.ts";
import { MAX_SPELL_LEVEL } from "@/vocabulary/dnd5.2/spells.ts";

import { JOINS_CLASS_LIST } from "./AptitudesPaths.ts";
import { ALLOWED_ALL } from "./AptitudeTargets.ts";

interface AptitudesData {
  [key: string]: {
    allowed: number;
    readonly available: number;
    description: string;
    id: string;
    /** A spell list's: whether its spells join the list of the class whose level gave it. */
    joinsclasslist?: boolean;
    name: string;
    spent: number;
    uses: number;
  };
}

/** A pool a level-up picks feats in: an unleveled aptitude, `shared` when its aptitude has spells too. */
interface FeatPool {
  allowed: number;
  available: number;
  id: string;
  name: string;
  shared: boolean;
  spent: number;
}

/**
 * A pool picks overfill: its aptitude, its name, the picks in it and its room; a leveled one's spell level (its
 * cantrips', or a spell level past its highest room's), or its spells of every level its room takes (`leveled`).
 */
interface OverfullPool {
  aptitudeId: string;
  level?: string;
  leveled?: boolean;
  name: string;
  picked: number;
  room: number;
}

/** A pool's slots: an unleveled aptitude's, or a leveled one's at a spell level (`spellLevel`). */
interface SlotPool {
  allowed: number;
  available: number;
  id: string;
  name: string;
  spellLevel?: number;
  spent: number;
}

/** A pool a level-up picks spells in: a leveled aptitude, with each spell level it has left (`levels`), or a shared one. */
interface SpellPool {
  allowed: number;
  available: number;
  id: string;
  leveled?: boolean;
  levels?: Record<string, { allowed: number; available: number; spent: number }>;
  name: string;
  spent: number;
}

type AptitudesById = Map<string, AptitudesData[string]>;

export interface AptitudeLevelData {
  allowed: number;
  readonly available: number;
  /** The spells its room takes, of its level or a lower one (`AptitudesComponent.assignSpells`). */
  readonly spent: number;
  uses: number;
}

/**
 * A level-up's own picks, counted by pool: its feats, and its spells by spell level (`""` for one picked in a pool
 * without spell levels). A pool's room for them adds them back to what it has left.
 */
export interface OwnPicks {
  feats: Record<string, number>;
  spells: Record<string, Record<string, number>>;
}

/** No picks of a level-up's own: a pool's room is what it has left. */
const NO_OWN_PICKS: OwnPicks = { feats: {}, spells: {} };

/** Every spell level a pool has room at, from 0 (cantrips). */
const TIERS = Array.from({ length: MAX_SPELL_LEVEL + 1 }, (_, level) => level);

/**
 * Where a leveled pool's spells go (`counts`, by their spell level in it), as the 2024 rules prepare them: a cantrip
 * in a cantrip's room alone; a spell of level 1 up to the highest the pool has room at (`highestRoomOf`) in any of its
 * room past cantrips, which is one count however the spell levels split it ("six spells of levels 1 and 2 in any
 * combination"), filled from the highest level's room down. A spell level all its spells are known at (`ALLOWED_ALL`)
 * takes its own spells alone. What no room takes is overspent: a spell above the highest room's level at its own level,
 * the others at the highest. What each spell level holds.
 */
function assignSpells(allowed: (level: number) => number, counts: Readonly<Record<string, number>>): number[] {
  const spent = TIERS.map(() => 0);
  const highest = highestRoomOf(allowed);
  let fitting = 0;
  for (const level of TIERS) {
    const count = counts[String(level)] ?? 0;
    if (level === 0 || allowed(level) === ALLOWED_ALL || level > highest) spent[level] += count;
    else fitting += count;
  }
  for (const tier of TIERS.toReversed()) {
    if (tier === 0 || allowed(tier) === ALLOWED_ALL) continue;
    const taken = Math.min(fitting, allowed(tier));
    spent[tier] += taken;
    fitting -= taken;
  }
  spent[highest] += fitting;
  return spent;
}

/**
 * The highest spell level a leveled pool has room at (`allowed`, each spell level's), past cantrips: every spell of its
 * level or a lower one fits its room, as the 2024 rules prepare them. 0 for a pool with none.
 */
function highestRoomOf(allowed: (level: number) => number): number {
  return TIERS.findLast((tier) => tier > 0 && allowed(tier) !== 0) ?? 0;
}

/** What's left to pick in all of `pools`. */
function sumAvailable(pools: { available: number }[]) {
  return pools.reduce((total, pool) => total + pool.available, 0);
}

/** A pool's spells by spell level, less a level-up's own (`own`). */
function withoutOwn(counts: Readonly<Record<string, number>>, own: Readonly<Record<string, number>>) {
  return Object.fromEntries(TIERS.map((level) => [String(level), (counts[String(level)] ?? 0) - (own[level] ?? 0)]));
}

/**
 * A character's aptitudes: what each allows it to pick (feats, spells, a leveled one's spells by spell level) and what it
 * spent, and the pools a level-up picks in.
 */
export default class AptitudesComponent extends CharacterComponent<LoadedCharacterData> {
  constructor(private readonly classes: ClassesComponent) {
    super();
  }

  /** The spell levels whose spells are all known: a state of the level, not a count it holds (`newSpellLevel`). */
  private readonly allKnownLevels = new WeakSet<AptitudeLevelData>();

  private readonly aptitudes: AptitudesData = {};

  // Track which aptitude keys are leveled (spell aptitudes)
  private readonly leveledAptitudeKeys = new Set<string>();

  /** Each leveled aptitude's known spells (picked or granted, not free) by their spell level in it, by its key. */
  private readonly spellCounts = new Map<string, Record<string, number>>();

  /**
   * An entry per aptitude of the ruleset (one per spell level for a leveled one, a spell list's: `SpellLists`): what it
   * allows, from the class levels' grants through it (its modifiers add the rest), and what the character spent on it.
   */
  override initialize(
    { grantCountsByPool }: Pick<LoadedCharacterData, "grantCountsByPool">,
    { rulesetData }: RulesetView,
  ) {
    this.buildEntries(Dnd52View.of(rulesetData).aptitudes, SpellLists.of(rulesetData).leveledAptitudeIds);
    const aptitudeById: AptitudesById = new Map(
      Object.values(this.aptitudes).map((aptitude) => [aptitude.id, aptitude]),
    );
    this.applyAllowances(aptitudeById, grantCountsByPool);
    this.applySpent(aptitudeById, this.countSpent());
  }

  /**
   * What each aptitude allows: the feats and the (non-free) spells the class levels grant through it (`grantCounts`,
   * by its id); its modifiers add the rest (a class level's, a feat's, a species').
   */
  private applyAllowances(aptitudeById: AptitudesById, grantCounts: Record<string, number>) {
    for (const [aptitudeId, count] of Object.entries(grantCounts)) {
      const aptitude = aptitudeById.get(aptitudeId);
      if (aptitude) aptitude.allowed += count;
    }
  }

  /**
   * Sets what the character spent on each aptitude: flat, or, for a leveled one, its spells by their spell level, which
   * its spell levels' room takes as the rules prepare them (`assignSpells`) when read.
   */
  private applySpent(
    aptitudeById: AptitudesById,
    { spentByAptitudeId, spentByAptitudeIdAndLevel }: ReturnType<AptitudesComponent["countSpent"]>,
  ) {
    for (const [aptitudeId, count] of Object.entries(spentByAptitudeId)) {
      const aptitude = aptitudeById.get(aptitudeId);
      if (aptitude) aptitude.spent = count;
    }
    const keyById = new Map(Object.entries(this.aptitudes).map(([key, aptitude]) => [aptitude.id, key]));
    for (const [aptitudeId, levelSpent] of Object.entries(spentByAptitudeIdAndLevel)) {
      const key = keyById.get(aptitudeId);
      if (key && this.leveledAptitudeKeys.has(key)) this.spellCounts.set(key, levelSpent);
    }
  }

  /** Each spell level's room a leveled aptitude's spells take (`counts`: its known ones by default), as read now. */
  private assignedSpells(key: string, counts = this.spellCounts.get(key) ?? {}): number[] {
    const aptitude = this.aptitudes[key];
    return assignSpells((level) => this.spellLevelOf(aptitude, String(level))?.allowed ?? 0, counts);
  }

  /** An entry per aptitude, with one per spell level for a leveled one. */
  private buildEntries(aptitudes: Aptitude[], leveledAptitudeIds: Set<string>) {
    for (const aptitude of aptitudes) {
      const key = stripSeparators(aptitude.name);
      this.aptitudes[key] = {
        id: aptitude.id,
        name: aptitude.name,
        description: aptitude.description || "",
        uses: 0,
        allowed: 0,
        // What's left to pick, counted when read: none once every spell is known
        get available() {
          return this.allowed === ALLOWED_ALL ? 0 : this.allowed - this.spent;
        },
        spent: 0,
      };

      if (leveledAptitudeIds.has(aptitude.id)) {
        this.leveledAptitudeKeys.add(key);
        const aptitudeObj = this.aptitudes[key] as Record<string, unknown>;
        for (const level of TIERS)
          aptitudeObj[String(level)] = this.newSpellLevel(() => this.assignedSpells(key)[level]);

        aptitudeObj[JOINS_CLASS_LIST.path] = false;
      }
    }
  }

  /** The feats and the (non-free) spells the character took per aptitude, per spell level for a leveled spell. */
  private countSpent() {
    const spentByAptitudeId: Record<string, number> = {};
    const spentByAptitudeIdAndLevel: Record<string, Record<string, number>> = {};

    for (const klass of Object.values(this.classes.getClasses())) {
      for (const level of klass.levels) {
        // A level's feats are in a pool, picked or granted, but its class's starting proficiencies, granted through none
        for (const { viaId } of level.feats)
          if (viaId !== undefined) spentByAptitudeId[viaId] = (spentByAptitudeId[viaId] || 0) + 1;

        for (const { free, spellLevel, viaId } of level.spells) {
          if (free) continue;
          if (spellLevel != null) {
            spentByAptitudeIdAndLevel[viaId] ??= {};
            spentByAptitudeIdAndLevel[viaId][spellLevel] = (spentByAptitudeIdAndLevel[viaId][spellLevel] || 0) + 1;
          } else {
            spentByAptitudeId[viaId] = (spentByAptitudeId[viaId] || 0) + 1;
          }
        }
      }
    }
    return { spentByAptitudeId, spentByAptitudeIdAndLevel };
  }

  /**
   * What a level-up's own spells (`own`, by their spell level) overfill in a leveled aptitude (`key`): its cantrips'
   * room; its room past cantrips, which its spells of every level up to its highest room's share; and a spell level
   * past its highest room's, which no room takes.
   */
  private findOverfullLevels(key: string, own: Readonly<Record<string, number>>): OverfullPool[] {
    const aptitude = this.aptitudes[key];
    const { id: aptitudeId, name } = aptitude;
    const allowed = (level: number) => this.spellLevelOf(aptitude, String(level))?.allowed ?? 0;
    const highest = highestRoomOf(allowed);
    const counts = this.spellCounts.get(key) ?? {};
    const overfull: OverfullPool[] = [];
    const cantrips = own["0"] ?? 0;
    const cantripRoom = allowed(0) === ALLOWED_ALL ? Infinity : allowed(0) - ((counts["0"] ?? 0) - cantrips);
    if (cantrips > cantripRoom)
      overfull.push({ aptitudeId, level: "0", name: `${name} (cantrips)`, picked: cantrips, room: cantripRoom });
    const fits = (level: number) => level > 0 && level <= highest && allowed(level) !== ALLOWED_ALL;
    const picked = TIERS.filter(fits).reduce((sum, level) => sum + (own[String(level)] ?? 0), 0);
    const room = TIERS.filter((tier) => tier > 0 && allowed(tier) !== ALLOWED_ALL).reduce(
      (sum, tier) => sum + allowed(tier),
      0,
    );
    const saved = TIERS.filter(fits).reduce((sum, level) => sum + (counts[String(level)] ?? 0), 0) - picked;
    if (picked > 0 && picked > room - saved) {
      const levels = highest > 1 ? `levels 1–${highest}` : "level 1";
      overfull.push({ aptitudeId, leveled: true, name: `${name} (${levels})`, picked, room: room - saved });
    }
    for (const level of TIERS.filter((tier) => tier > highest && (own[String(tier)] ?? 0) > 0)) {
      const count = own[String(level)];
      overfull.push({ aptitudeId, level: String(level), name: `${name} (level ${level})`, picked: count, room: 0 });
    }
    return overfull;
  }

  /**
   * A spell level's entry. Its known slots are a count, or all known (ALLOWED_ALL), which a `set -1` makes them and an
   * add, before or after, leaves: the class tables' and the level-up wizard's count. Code that takes all known back
   * clears it (`clearAllKnown`). What it spent is what its aptitude's spells take of its room (`spent`), when read.
   */
  private newSpellLevel(spent: () => number): AptitudeLevelData {
    const allKnownLevels = this.allKnownLevels;
    let count = 0;
    return {
      uses: 0,
      get allowed() {
        return allKnownLevels.has(this) ? ALLOWED_ALL : count;
      },
      set allowed(value: number) {
        if (value === ALLOWED_ALL) allKnownLevels.add(this);
        else if (!allKnownLevels.has(this)) count = value;
      },
      get spent() {
        return spent();
      },
      // What's left to pick, counted when read: none once every spell is known
      get available() {
        return this.allowed === ALLOWED_ALL ? 0 : this.allowed - this.spent;
      },
    };
  }

  /** A leveled aptitude's spell level `level`, if it has one. */
  private spellLevelOf(aptitude: AptitudesData[string], level: string) {
    return (aptitude as Record<string, unknown>)[level] as AptitudeLevelData | undefined;
  }

  /**
   * A leveled aptitude's spell pool (`key`): what each spell level that has room left gives, or that a level-up's own
   * picks (`own`, by their spell level) take room at, with its room for them (what its spells but those leave it), and
   * all of them. Its room past cantrips is one count, which its spells of any level up to its highest room's fill, from
   * the highest level's room down (`assignSpells`): what's left of it shows at its lowest levels.
   */
  private toLeveledPool(key: string, own: Record<string, number>): SpellPool {
    const aptitude = this.aptitudes[key];
    const counts = this.spellCounts.get(key) ?? {};
    const before = this.assignedSpells(key, withoutOwn(counts, own));
    const after = this.assignedSpells(key);
    const levels: Record<string, { allowed: number; available: number; spent: number }> = {};
    let available = 0;
    for (const level of TIERS) {
      const levelData = this.spellLevelOf(aptitude, String(level));
      if (!levelData) continue;
      const room = levelData.allowed === ALLOWED_ALL ? 0 : levelData.allowed - before[level];
      if (room > 0 || after[level] > before[level]) {
        levels[String(level)] = { allowed: levelData.allowed, spent: before[level], available: room };
        available += Math.max(0, room);
      }
    }
    const { id, name, allowed, spent } = aptitude;
    return { id, name, allowed, spent, available, leveled: true, levels };
  }

  /** Takes a spell level's all known back: its known slots a count again, none. */
  clearAllKnown(level: AptitudeLevelData): void {
    this.allKnownLevels.delete(level);
    level.allowed = 0;
  }

  getAptitudes(): AptitudesData {
    return this.aptitudes;
  }

  /**
   * The highest spell level a leveled aptitude (`aptitudeId`) has room at, past cantrips: the highest level of spell a
   * pick in its room takes (`highestRoomOf`). 0 for an aptitude with none, or none leveled.
   */
  getHighestRoomLevel(aptitudeId: string): number {
    const key = [...this.leveledAptitudeKeys].find((leveled) => this.aptitudes[leveled].id === aptitudeId);
    if (key === undefined) return 0;
    const aptitude = this.aptitudes[key];
    return highestRoomOf((level) => this.spellLevelOf(aptitude, String(level))?.allowed ?? 0);
  }

  /**
   * The pools a level-up picks in, by aptitude id, and what's left to pick in each kind. An unleveled aptitude is a
   * feat pool, `shared` when its aptitude has spells too, which makes it a spell pool as well: its picks count as
   * spells. A leveled aptitude is a spell pool, with what each spell level it has left gives. A pool's room for the
   * level-up's own picks of its kind (`own`, which the character holds) adds them back to what it has left: a shared
   * pool's feats take room from its spells, and its spells from its feats.
   */
  getLevelUpPools(view: Pick<Dnd52View, "aptitudeIdsWithSpells">, own: OwnPicks = NO_OWN_PICKS) {
    const featPools: Record<string, FeatPool> = {};
    const spellPools: Record<string, SpellPool> = {};
    for (const [key, aptitude] of Object.entries(this.aptitudes)) {
      const { id, name, allowed, spent, available } = aptitude;
      if (this.leveledAptitudeKeys.has(key)) {
        spellPools[id] = this.toLeveledPool(key, own.spells[id] ?? {});
        continue;
      }
      const shared = view.aptitudeIdsWithSpells.has(id);
      const feats = own.feats[id] ?? 0;
      featPools[id] = { id, name, allowed, spent: spent - feats, available: available + feats, shared };
      const spells = own.spells[id]?.[""] ?? 0;
      if (shared) spellPools[id] = { id, name, allowed, spent: spent - spells, available: available + spells };
    }
    return {
      featPools,
      featsToSelect: sumAvailable(Object.values(featPools).filter((pool) => !pool.shared)),
      spellPools,
      spellsToSelect: sumAvailable(Object.values(spellPools)),
    };
  }

  /**
   * The pools a level-up's own picks (`own`, which the character holds) overfill: each pool they're in that has less
   * than nothing left, a leveled one's cantrips, its spells of every level its room takes, and its spells past its
   * highest room's level (`findOverfullLevels`), with how many they pick there and its room for them.
   */
  getOverfullPools(own: OwnPicks): OverfullPool[] {
    const overfull: OverfullPool[] = [];
    for (const [key, aptitude] of Object.entries(this.aptitudes)) {
      const { id: aptitudeId, name } = aptitude;
      if (!this.leveledAptitudeKeys.has(key)) {
        const picked = (own.feats[aptitudeId] ?? 0) + (own.spells[aptitudeId]?.[""] ?? 0);
        if (picked > 0 && aptitude.available < 0)
          overfull.push({ aptitudeId, name, picked, room: aptitude.available + picked });
        continue;
      }
      overfull.push(...this.findOverfullLevels(key, own.spells[aptitudeId] ?? {}));
    }
    return overfull;
  }

  /** Each pool's slots: an unleveled aptitude's, and a leveled one's at each of its spell levels. */
  getSlotPools(): SlotPool[] {
    const pools: SlotPool[] = [];
    for (const [key, aptitude] of Object.entries(this.aptitudes)) {
      const { id, name } = aptitude;
      if (!this.leveledAptitudeKeys.has(key)) {
        pools.push({ id, name, allowed: aptitude.allowed, spent: aptitude.spent, available: aptitude.available });
        continue;
      }
      for (const spellLevel of TIERS) {
        const slots = this.spellLevelOf(aptitude, String(spellLevel));
        if (slots)
          pools.push({ id, name, spellLevel, allowed: slots.allowed, spent: slots.spent, available: slots.available });
      }
    }
    return pools;
  }

  isLeveledAptitude(key: string): boolean {
    return this.leveledAptitudeKeys.has(key);
  }
}
