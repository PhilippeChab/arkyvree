import { CharacterComponent } from "@/engine/core/character/index.ts";
import type { RulesetData, RulesetView } from "@/engine/core/view/index.ts";
import type ClassesComponent from "@/engine/rulesets/dnd3.5/model/classes/ClassesComponent.ts";
import type IdentityComponent from "@/engine/rulesets/dnd3.5/model/identity/IdentityComponent.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import SpellLists from "@/engine/rulesets/dnd3.5/rules/SpellLists.ts";
import { type Aptitude } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";
import { MAX_SPELL_LEVEL } from "@/vocabulary/dnd3.5/spells.ts";

import { JOINS_CLASS_LIST } from "./AptitudesPaths.ts";

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

/** A pool a level-up picks feats in: an unleveled aptitude, `shared` when its aptitude has powers too. */
interface FeatPool {
  allowed: number;
  available: number;
  id: string;
  name: string;
  shared: boolean;
  spent: number;
}

/** A pool picks overfill: its aptitude, its spell level for a leveled one, its name, the picks in it and its room. */
interface OverfullPool {
  aptitudeId: string;
  level?: string;
  name: string;
  picked: number;
  room: number;
}

/** A pool a level-up picks powers in: a leveled aptitude, with each spell level it has left (`levels`), or a shared one. */
interface PowerPool {
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
  spent: number;
  uses: number;
}

/**
 * A level-up's own picks, counted by pool: its feats, and its powers by spell level (`""` for one picked in a pool
 * without spell levels). A pool's room for them adds them back to what it has left.
 */
export interface OwnPicks {
  feats: Record<string, number>;
  powers: Record<string, Record<string, number>>;
}

/** No picks of a level-up's own: a pool's room is what it has left. */
const NO_OWN_PICKS: OwnPicks = { feats: {}, powers: {} };

export const ALLOWED_ALL = -1;

/** What's left to pick in all of `pools`. */
function sumAvailable(pools: { available: number }[]) {
  return pools.reduce((total, pool) => total + pool.available, 0);
}

/**
 * A character's aptitudes: what each allows it to pick (feats, powers, a leveled one's spells by spell level) and what it
 * spent, and the pools a level-up picks in.
 */
export default class AptitudesComponent extends CharacterComponent<LoadedCharacterData> {
  constructor(
    private readonly identity: IdentityComponent,
    private readonly classes: ClassesComponent,
    /**
     * The general feats a character has at its total level: its kind's rule, which a bonded creature has none of. The
     * one rule a component takes from its character, beside its siblings.
     */
    private readonly countGeneralFeats: (totalLevel: number) => number,
  ) {
    super();
  }

  /** The spell levels whose spells are all known: a state of the level, not a count it holds (`newSpellLevel`). */
  private readonly allKnownLevels = new WeakSet<AptitudeLevelData>();

  private readonly aptitudes: AptitudesData = {};

  // Track which aptitude keys are leveled (spell aptitudes)
  private readonly leveledAptitudeKeys = new Set<string>();

  /** The general feats the character's level gives, when its ruleset has no aptitude for them to count toward. */
  private unplacedGeneralFeats = 0;

  /**
   * An entry per aptitude of the ruleset (one per spell level for a leveled one, a spell list's: `SpellLists`): what it
   * allows, from the class levels' feats and powers and the general feats, and what the character spent on it.
   */
  override initialize(
    {
      klassLevelFeatCountsByAptitudeId,
      klassLevelPowerCountsByAptitudeId,
    }: Pick<LoadedCharacterData, "klassLevelFeatCountsByAptitudeId" | "klassLevelPowerCountsByAptitudeId">,
    { rulesetData }: RulesetView,
  ) {
    this.buildEntries(rulesetData.aptitudes, SpellLists.of(rulesetData).leveledAptitudeIds);
    const aptitudeById: AptitudesById = new Map(
      Object.values(this.aptitudes).map((aptitude) => [aptitude.id, aptitude]),
    );
    this.applyAllowances(aptitudeById, klassLevelFeatCountsByAptitudeId, klassLevelPowerCountsByAptitudeId);
    this.applySpent(aptitudeById, this.countSpent());
  }

  /**
   * What each aptitude allows: the feats and the (non-free) powers the class levels grant through it, and the general
   * feats its total level gives (`countGeneralFeats`).
   */
  private applyAllowances(
    aptitudeById: AptitudesById,
    klassLevelFeatCountsByAptitudeId: Record<string, number>,
    klassLevelPowerCountsByAptitudeId: Record<string, number>,
  ) {
    for (const counts of [klassLevelFeatCountsByAptitudeId, klassLevelPowerCountsByAptitudeId]) {
      for (const [aptitudeId, count] of Object.entries(counts)) {
        const aptitude = aptitudeById.get(aptitudeId);
        if (aptitude) aptitude.allowed += count;
      }
    }

    const generalFeats = this.countGeneralFeats(this.identity.getIdentity().meta.level);
    const general = this.aptitudes[LevelRules.GENERAL_FEATS_APTITUDE_SLUG];
    if (general) general.allowed += generalFeats;
    this.unplacedGeneralFeats = general ? 0 : generalFeats;
  }

  /** Sets what the character spent on each aptitude: flat, or per spell level for a leveled one. */
  private applySpent(
    aptitudeById: AptitudesById,
    { spentByAptitudeId, spentByAptitudeIdAndLevel }: ReturnType<AptitudesComponent["countSpent"]>,
  ) {
    for (const [aptitudeId, count] of Object.entries(spentByAptitudeId)) {
      const aptitude = aptitudeById.get(aptitudeId);
      if (aptitude) aptitude.spent = count;
    }

    for (const [aptitudeId, levelSpent] of Object.entries(spentByAptitudeIdAndLevel)) {
      const aptitude = aptitudeById.get(aptitudeId);
      if (!aptitude) continue;

      const aptitudeObj = aptitude as Record<string, unknown>;
      for (const [levelStr, count] of Object.entries(levelSpent)) {
        const levelData = aptitudeObj[levelStr] as AptitudeLevelData | undefined;
        if (levelData) levelData.spent = count;
      }
    }
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
        for (let level = 0; level <= MAX_SPELL_LEVEL; level++) aptitudeObj[String(level)] = this.newSpellLevel();

        aptitudeObj[JOINS_CLASS_LIST.path] = false;
      }
    }
  }

  /** The feats and the (non-free) powers the character took per aptitude, per spell level for a leveled power. */
  private countSpent() {
    const spentByAptitudeId: Record<string, number> = {};
    const spentByAptitudeIdAndLevel: Record<string, Record<number, number>> = {};

    for (const klass of Object.values(this.classes.getClasses())) {
      for (const level of klass.levels) {
        for (const feat of level.feats)
          spentByAptitudeId[feat.aptitudeId] = (spentByAptitudeId[feat.aptitudeId] || 0) + 1;

        for (const power of level.powers) {
          if (power.free) continue;
          if (power.powerLevel != null) {
            spentByAptitudeIdAndLevel[power.aptitudeId] ??= {};
            spentByAptitudeIdAndLevel[power.aptitudeId][power.powerLevel] =
              (spentByAptitudeIdAndLevel[power.aptitudeId][power.powerLevel] || 0) + 1;
          } else {
            spentByAptitudeId[power.aptitudeId] = (spentByAptitudeId[power.aptitudeId] || 0) + 1;
          }
        }
      }
    }
    return { spentByAptitudeId, spentByAptitudeIdAndLevel };
  }

  /**
   * A spell level's entry. Its known slots are a count, or all known (ALLOWED_ALL), which a `set -1` makes them and an
   * add, before or after, leaves: the class tables' and the level-up wizard's count. Code that takes all known back
   * clears it (`clearAllKnown`).
   */
  private newSpellLevel(): AptitudeLevelData {
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
      spent: 0,
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
   * A leveled aptitude's power pool: what each spell level that has room left gives, or that a level-up's own picks
   * (`own`, by spell level) are in, with its room for them (what it has left, and them), and all of them.
   */
  private toLeveledPool(aptitude: AptitudesData[string], own: Record<string, number>): PowerPool {
    const levels: Record<string, { allowed: number; available: number; spent: number }> = {};
    let available = 0;
    for (let spellLevel = 0; spellLevel <= MAX_SPELL_LEVEL; spellLevel++) {
      const levelData = this.spellLevelOf(aptitude, String(spellLevel));
      const picked = own[String(spellLevel)] ?? 0;
      const room = (levelData?.available ?? 0) + picked;
      if (levelData && (room > 0 || picked > 0)) {
        levels[String(spellLevel)] = { allowed: levelData.allowed, spent: levelData.spent - picked, available: room };
        available += room;
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
   * The pools a level-up picks in, by aptitude id, and what's left to pick in each kind. An unleveled aptitude is a
   * feat pool, `shared` when its aptitude has powers too, which makes it a power pool as well: its picks count as
   * powers. A leveled aptitude is a power pool, with what each spell level it has left gives. A pool's room for the
   * level-up's own picks of its kind (`own`, which the character holds) adds them back to what it has left: a shared
   * pool's feats take room from its powers, and its powers from its feats.
   */
  getLevelUpPools(rulesetData: Pick<RulesetData, "aptitudeIdsWithPowers">, own: OwnPicks = NO_OWN_PICKS) {
    const featPools: Record<string, FeatPool> = {};
    const powerPools: Record<string, PowerPool> = {};
    for (const [key, aptitude] of Object.entries(this.aptitudes)) {
      const { id, name, allowed, spent, available } = aptitude;
      if (this.leveledAptitudeKeys.has(key)) {
        powerPools[id] = this.toLeveledPool(aptitude, own.powers[id] ?? {});
        continue;
      }
      const shared = rulesetData.aptitudeIdsWithPowers.has(id);
      const feats = own.feats[id] ?? 0;
      featPools[id] = { id, name, allowed, spent: spent - feats, available: available + feats, shared };
      const powers = own.powers[id]?.[""] ?? 0;
      if (shared) powerPools[id] = { id, name, allowed, spent: spent - powers, available: available + powers };
    }
    return {
      featPools,
      featsToSelect: sumAvailable(Object.values(featPools).filter((pool) => !pool.shared)),
      powerPools,
      powersToSelect: sumAvailable(Object.values(powerPools)),
    };
  }

  /**
   * The pools a level-up's own picks (`own`, which the character holds) overfill: each pool they're in that has less
   * than nothing left, a leveled one's at each spell level, with how many they pick there and its room for them.
   */
  getOverfullPools(own: OwnPicks): OverfullPool[] {
    const overfull: OverfullPool[] = [];
    for (const [key, aptitude] of Object.entries(this.aptitudes)) {
      const { id: aptitudeId, name } = aptitude;
      if (!this.leveledAptitudeKeys.has(key)) {
        const picked = (own.feats[aptitudeId] ?? 0) + (own.powers[aptitudeId]?.[""] ?? 0);
        if (picked > 0 && aptitude.available < 0)
          overfull.push({ aptitudeId, name, picked, room: aptitude.available + picked });
        continue;
      }
      for (const [level, picked] of Object.entries(own.powers[aptitudeId] ?? {})) {
        const available = this.spellLevelOf(aptitude, level)?.available ?? -picked;
        if (picked > 0 && available < 0)
          overfull.push({ aptitudeId, level, name: `${name} (level ${level})`, picked, room: available + picked });
      }
    }
    return overfull;
  }

  /** The general feats the character's level gives that count toward no aptitude: its ruleset has no General. */
  getUnplacedGeneralFeats(): number {
    return this.unplacedGeneralFeats;
  }

  isLeveledAptitude(key: string): boolean {
    return this.leveledAptitudeKeys.has(key);
  }
}
