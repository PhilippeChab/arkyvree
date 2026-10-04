import { getNumericOperators } from "@/shared/customization/operators.ts";
import { deriveSegmentLabels, type TargetPath } from "@/shared/customization/target.ts";
import { type Aptitude } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

import type DetailedCharacterClasses from "./DetailedCharacterClasses.ts";
import type DetailedCharacterIdentity from "./DetailedCharacterIdentity.ts";

const ALLOWED_ENTITY_TYPES = ["feats", "klass_levels", "races"];

const NAVIGATABLE_PATHS = [
  {
    path: "uses",
    description: "Uses per day (casts, charges, etc.)",
    type: "number" as const,
    allowedEntityTypes: ALLOWED_ENTITY_TYPES,
  },
  {
    path: "allowed",
    description: "Slots for known spells or feats",
    type: "number" as const,
    allowedEntityTypes: ALLOWED_ENTITY_TYPES,
  },
];

/**
 * What a modifier on a pool's slots may do: grant more (`add`), or make a spell level's all known (`set` -1). The
 * level-up wizard and the class tables count these without a character, the sheet's way: other operators, and
 * templates, would count differently there than on the sheet. A pool's own uses per day count on the sheet alone.
 */
const SPELL_LEVEL_SLOT_MODIFIERS: Record<string, Pick<TargetPath, "operators" | "setValues" | "literalOnly">> = {
  allowed: { operators: ["add", "set"], setValues: [{ value: "-1", label: "All known" }], literalOnly: true },
  uses: { operators: ["add"], literalOnly: true },
};
const POOL_SLOT_MODIFIERS: Pick<TargetPath, "operators" | "literalOnly"> = { operators: ["add"], literalOnly: true };

export const ALLOWED_ALL = -1;

export type AptitudeLevelData = {
  uses: number;
  allowed: number;
  spent: number;
  available: number;
};

type DetailedCharacterComprehensiveAptitudes = {
  [key: string]: {
    id: string;
    name: string;
    description: string;
    uses: number;
    allowed: number;
    spent: number;
    available: number;
  };
};

type AptitudesById = Map<string, DetailedCharacterComprehensiveAptitudes[string]>;

export default class DetailedCharacterAptitudes {
  constructor(
    private readonly characterIdentity: DetailedCharacterIdentity,
    private readonly characterClasses: DetailedCharacterClasses,
    /** Largest spell/power level a leveled aptitude enumerates (inclusive).
     *  Required — each ruleset must pass its own value (e.g.
     *  `Dnd35LevelsHooks.MAX_SPELL_LEVEL`). No default so a universal file
     *  never carries a ruleset-specific constant. */
    readonly maxSpellLevel: number,
  ) {}

  static getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels(NAVIGATABLE_PATHS);
  }

  static generateTargetPaths(
    aptitudes: Aptitude[],
    kind: "modifier" | "requirement",
    leveledAptitudeIds: Set<string>,
    maxSpellLevel: number,
  ): TargetPath[] {
    const paths: TargetPath[] = [];
    const operators = getNumericOperators(kind);

    for (const aptitude of aptitudes) {
      const normalizedAptitudeName = stripSeparators(aptitude.name);

      if (leveledAptitudeIds.has(aptitude.id)) {
        // Generate per-level paths for leveled aptitudes (0..maxSpellLevel)
        for (let level = 0; level <= maxSpellLevel; level++) {
          for (const subPath of NAVIGATABLE_PATHS) {
            paths.push({
              path: `aptitudes.${normalizedAptitudeName}.${level}.${subPath.path}`,
              category: "aptitudes",
              description: subPath.description,
              valueType: subPath.type,
              operators,
              ...("allowedEntityTypes" in subPath && { allowedEntityTypes: subPath.allowedEntityTypes }),
              ...(kind === "modifier" && SPELL_LEVEL_SLOT_MODIFIERS[subPath.path]),
            });
          }
        }
      } else {
        // Generate flat paths for non-leveled aptitudes
        for (const subPath of NAVIGATABLE_PATHS) {
          paths.push({
            path: `aptitudes.${normalizedAptitudeName}.${subPath.path}`,
            category: "aptitudes",
            description: subPath.description,
            valueType: subPath.type,
            operators,
            ...("allowedEntityTypes" in subPath && { allowedEntityTypes: subPath.allowedEntityTypes }),
            ...(kind === "modifier" && subPath.path === "allowed" && POOL_SLOT_MODIFIERS),
          });
        }
      }
    }

    return paths;
  }

  private readonly detailedCharacterComprehensiveAptitudes: DetailedCharacterComprehensiveAptitudes = {};

  // Track which aptitude keys are leveled (spell aptitudes)
  private readonly leveledAptitudeKeys = new Set<string>();

  /** An entry per aptitude, with one per spell level for a leveled one. */
  private buildEntries(aptitudes: Aptitude[], leveledAptitudeIds: Set<string>) {
    for (const aptitude of aptitudes) {
      const key = stripSeparators(aptitude.name);
      this.detailedCharacterComprehensiveAptitudes[key] = {
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
        const aptitudeObj = this.detailedCharacterComprehensiveAptitudes[key] as Record<string, unknown>;
        for (let level = 0; level <= this.maxSpellLevel; level++) {
          aptitudeObj[String(level)] = {
            uses: 0,
            allowed: 0,
            spent: 0,
            available: 0,
          } satisfies AptitudeLevelData;
        }
      }
    }
  }

  /**
   * What each aptitude allows: the feats and the (non-free) powers the class levels grant through it, and a general
   * feat at the first level and every third.
   */
  private applyAllowances(
    aptitudeById: AptitudesById,
    klassLevelFeatCountsByAptitudeId: Record<string, number>,
    klassLevelPowerCountsByAptitudeId: Record<string, number>,
  ) {
    for (const counts of [klassLevelFeatCountsByAptitudeId, klassLevelPowerCountsByAptitudeId]) {
      for (const [aptitudeId, count] of Object.entries(counts)) {
        const aptitude = aptitudeById.get(aptitudeId);
        if (aptitude) {
          aptitude.allowed += count;
        }
      }
    }

    const level = this.characterIdentity.getIdentity().meta.level;
    this.detailedCharacterComprehensiveAptitudes["general"].allowed += level === 0 ? 0 : Math.floor(level / 3) + 1;
  }

  /** Sets what the character spent on each aptitude: flat, or per spell level for a leveled one. */
  private applySpent(
    aptitudeById: AptitudesById,
    { spentByAptitudeId, spentByAptitudeIdAndLevel }: ReturnType<DetailedCharacterAptitudes["countSpent"]>,
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
        if (levelData) {
          levelData.spent = count;
        }
      }
    }
  }

  /** The feats and the (non-free) powers the character took per aptitude, per spell level for a leveled power. */
  private countSpent() {
    const spentByAptitudeId: Record<string, number> = {};
    const spentByAptitudeIdAndLevel: Record<string, Record<number, number>> = {};

    for (const klass of Object.values(this.characterClasses.getClasses())) {
      for (const level of klass.levels) {
        for (const feat of level.feats) {
          spentByAptitudeId[feat.aptitudeId] = (spentByAptitudeId[feat.aptitudeId] || 0) + 1;
        }
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

  initialize(
    aptitudes: Aptitude[],
    klassLevelFeatCountsByAptitudeId: Record<string, number>,
    klassLevelPowerCountsByAptitudeId: Record<string, number> = {},
    leveledAptitudeIds: Set<string> = new Set(),
  ) {
    this.buildEntries(aptitudes, leveledAptitudeIds);
    const aptitudeById: AptitudesById = new Map(
      Object.values(this.detailedCharacterComprehensiveAptitudes).map((aptitude) => [aptitude.id, aptitude]),
    );
    this.applyAllowances(aptitudeById, klassLevelFeatCountsByAptitudeId, klassLevelPowerCountsByAptitudeId);
    this.applySpent(aptitudeById, this.countSpent());
    this.updateAvailables();
  }

  getAptitudes() {
    return this.detailedCharacterComprehensiveAptitudes;
  }

  /** Returns IDs of all non-leveled aptitudes. */
  getNonLeveledAptitudeIds(): string[] {
    return Object.entries(this.detailedCharacterComprehensiveAptitudes)
      .filter(([key]) => !this.leveledAptitudeKeys.has(key))
      .map(([, apt]) => apt.id);
  }

  isLeveledAptitude(key: string): boolean {
    return this.leveledAptitudeKeys.has(key);
  }

  updateAvailables() {
    for (const [key, aptitude] of Object.entries(this.detailedCharacterComprehensiveAptitudes)) {
      if (this.leveledAptitudeKeys.has(key)) {
        // Update per-level availables for spell aptitudes
        const aptitudeObj = aptitude as Record<string, unknown>;
        for (let level = 0; level <= this.maxSpellLevel; level++) {
          const levelData = aptitudeObj[String(level)] as AptitudeLevelData | undefined;
          if (levelData) {
            if (levelData.allowed === ALLOWED_ALL) {
              levelData.available = 0;
            } else {
              levelData.available = levelData.allowed - levelData.spent;
            }
          }
        }
      } else {
        // Update flat available
        if (aptitude.allowed === ALLOWED_ALL) {
          aptitude.available = 0;
        } else {
          aptitude.available = aptitude.allowed - aptitude.spent;
        }
      }
    }
  }

  /**
   * Extracts non-leveled aptitude pools formatted for feat selection.
   * Returns pool objects keyed by aptitude ID.
   */
  extractFeatPools(): Record<
    string,
    { id: string; name: string; allowed: number; spent: number; available: number; shared: boolean }
  > {
    const pools: Record<
      string,
      { id: string; name: string; allowed: number; spent: number; available: number; shared: boolean }
    > = {};
    for (const [key, aptitude] of Object.entries(this.detailedCharacterComprehensiveAptitudes)) {
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
      id: string;
      name: string;
      allowed: number;
      spent: number;
      available: number;
      leveled?: boolean;
      levels?: Record<string, { allowed: number; spent: number; available: number }>;
    }
  > {
    const pools: Record<
      string,
      {
        id: string;
        name: string;
        allowed: number;
        spent: number;
        available: number;
        leveled?: boolean;
        levels?: Record<string, { allowed: number; spent: number; available: number }>;
      }
    > = {};

    for (const [key, aptitude] of Object.entries(this.detailedCharacterComprehensiveAptitudes)) {
      if (this.leveledAptitudeKeys.has(key)) {
        const aptitudeObj = aptitude as Record<string, unknown>;
        const levels: Record<string, { allowed: number; spent: number; available: number }> = {};
        let totalAvailable = 0;

        for (let spellLevel = 0; spellLevel <= this.maxSpellLevel; spellLevel++) {
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
}
