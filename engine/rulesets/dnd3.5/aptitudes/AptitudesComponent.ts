import type ClassesComponent from "@/engine/rulesets/dnd3.5/classes/ClassesComponent.ts";
import type IdentityComponent from "@/engine/rulesets/dnd3.5/identity/IdentityComponent.ts";
import { Dnd35LevelsRules } from "@/engine/rulesets/dnd3.5/levels/Dnd35LevelsRules.ts";
import { MAX_SPELL_LEVEL } from "@/shared/dnd3.5/spells.ts";
import { type Aptitude } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

import { JOINS_CLASS_LIST } from "./AptitudesPaths.ts";

type AptitudesById = Map<string, AptitudesData[string]>;

type AptitudesData = {
  [key: string]: {
    allowed: number;
    available: number;
    description: string;
    id: string;
    /** A spell list's: whether its spells join the list of the class whose level gave it. */
    joinsclasslist?: boolean;
    name: string;
    spent: number;
    uses: number;
  };
};

export type AptitudeLevelData = {
  allowed: number;
  available: number;
  spent: number;
  uses: number;
};

export const ALLOWED_ALL = -1;

export default class AptitudesComponent {
  constructor(
    private readonly identity: IdentityComponent,
    private readonly classes: ClassesComponent,
    /** The general feats a character has at its total level: the ruleset's rule, which a bonded creature has none of. */
    private readonly countGeneralFeats: (totalLevel: number) => number,
  ) {}

  /** The spell levels whose spells are all known: a state of the level, not a count it holds (`newSpellLevel`). */
  private readonly allKnownLevels = new WeakSet<AptitudeLevelData>();

  private readonly aptitudes: AptitudesData = {};

  // Track which aptitude keys are leveled (spell aptitudes)
  private readonly leveledAptitudeKeys = new Set<string>();

  /** The general feats the character's level gives, when its ruleset has no aptitude for them to count toward. */
  private unplacedGeneralFeats = 0;

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
    const general = this.aptitudes[Dnd35LevelsRules.GENERAL_FEATS_APTITUDE_SLUG];
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
      if (aptitude) {
        aptitude.spent = count;
        aptitude.available = aptitude.allowed - aptitude.spent;
      }
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
        available: 0,
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
      available: 0,
    };
  }

  /** Takes a spell level's all known back: its known slots a count again, none. */
  clearAllKnown(level: AptitudeLevelData): void {
    this.allKnownLevels.delete(level);
    level.allowed = 0;
  }

  /**
   * Extracts non-leveled aptitude pools formatted for feat selection.
   * Returns pool objects keyed by aptitude ID.
   */
  extractFeatPools(): Record<
    string,
    { allowed: number; available: number; id: string; name: string; shared: boolean; spent: number }
  > {
    const pools: Record<
      string,
      { allowed: number; available: number; id: string; name: string; shared: boolean; spent: number }
    > = {};
    for (const [key, aptitude] of Object.entries(this.aptitudes)) {
      if (this.leveledAptitudeKeys.has(key)) continue;
      pools[aptitude.id] = {
        id: aptitude.id,
        name: aptitude.name,
        allowed: aptitude.allowed,
        spent: aptitude.spent,
        available: aptitude.available,
        shared: false,
      };
    }
    return pools;
  }

  /**
   * Extracts aptitude pools formatted for power/spell selection.
   * Includes leveled aptitudes with per-spell-level breakdowns.
   */
  extractPowerPools(): Record<
    string,
    {
      allowed: number;
      available: number;
      id: string;
      leveled?: boolean;
      levels?: Record<string, { allowed: number; available: number; spent: number }>;
      name: string;
      spent: number;
    }
  > {
    const pools: Record<
      string,
      {
        allowed: number;
        available: number;
        id: string;
        leveled?: boolean;
        levels?: Record<string, { allowed: number; available: number; spent: number }>;
        name: string;
        spent: number;
      }
    > = {};

    for (const [key, aptitude] of Object.entries(this.aptitudes)) {
      if (this.leveledAptitudeKeys.has(key)) {
        const aptitudeObj = aptitude as Record<string, unknown>;
        const levels: Record<string, { allowed: number; available: number; spent: number }> = {};
        let totalAvailable = 0;

        for (let spellLevel = 0; spellLevel <= MAX_SPELL_LEVEL; spellLevel++) {
          const levelData = aptitudeObj[String(spellLevel)] as AptitudeLevelData | undefined;
          if (levelData && levelData.available > 0) {
            levels[String(spellLevel)] = {
              allowed: levelData.allowed,
              spent: levelData.spent,
              available: levelData.available,
            };
            totalAvailable += levelData.available;
          }
        }

        pools[aptitude.id] = {
          id: aptitude.id,
          name: aptitude.name,
          allowed: aptitude.allowed,
          spent: aptitude.spent,
          available: totalAvailable,
          leveled: true,
          levels,
        };
      } else {
        pools[aptitude.id] = {
          id: aptitude.id,
          name: aptitude.name,
          allowed: aptitude.allowed,
          spent: aptitude.spent,
          available: aptitude.available,
        };
      }
    }
    return pools;
  }

  getAptitudes() {
    return this.aptitudes;
  }

  /** Returns IDs of all non-leveled aptitudes. */
  getNonLeveledAptitudeIds(): string[] {
    return Object.entries(this.aptitudes)
      .filter(([key]) => !this.leveledAptitudeKeys.has(key))
      .map(([, apt]) => apt.id);
  }

  /** The general feats the character's level gives that count toward no aptitude: its ruleset has no General. */
  getUnplacedGeneralFeats(): number {
    return this.unplacedGeneralFeats;
  }

  initialize(
    aptitudes: Aptitude[],
    klassLevelFeatCountsByAptitudeId: Record<string, number>,
    klassLevelPowerCountsByAptitudeId: Record<string, number> = {},
    leveledAptitudeIds: Set<string> = new Set(),
  ) {
    this.buildEntries(aptitudes, leveledAptitudeIds);
    const aptitudeById: AptitudesById = new Map(
      Object.values(this.aptitudes).map((aptitude) => [aptitude.id, aptitude]),
    );
    this.applyAllowances(aptitudeById, klassLevelFeatCountsByAptitudeId, klassLevelPowerCountsByAptitudeId);
    this.applySpent(aptitudeById, this.countSpent());
    this.updateAvailables();
  }

  isLeveledAptitude(key: string): boolean {
    return this.leveledAptitudeKeys.has(key);
  }

  updateAvailables() {
    for (const [key, aptitude] of Object.entries(this.aptitudes)) {
      if (this.leveledAptitudeKeys.has(key)) {
        // Update per-level availables for spell aptitudes
        const aptitudeObj = aptitude as Record<string, unknown>;
        for (let level = 0; level <= MAX_SPELL_LEVEL; level++) {
          const levelData = aptitudeObj[String(level)] as AptitudeLevelData | undefined;
          if (levelData) {
            if (levelData.allowed === ALLOWED_ALL) levelData.available = 0;
            else levelData.available = levelData.allowed - levelData.spent;
          }
        }
      } else {
        // Update flat available
        if (aptitude.allowed === ALLOWED_ALL) aptitude.available = 0;
        else aptitude.available = aptitude.allowed - aptitude.spent;
      }
    }
  }
}
