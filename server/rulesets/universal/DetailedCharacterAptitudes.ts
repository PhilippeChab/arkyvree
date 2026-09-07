import type { TargetPath } from "@/shared/customization/target.ts";
import { type Aptitude } from "@/shared/relations.ts";
import { deriveSegmentLabels, stripSeparators } from "@/shared/utils.ts";
import type DetailedCharacterClasses from "./DetailedCharacterClasses.ts";
import type DetailedCharacterIdentity from "./DetailedCharacterIdentity.ts";

const ALLOWED_ENTITY_TYPES = ["feats", "klass_levels", "races"];

const NAVIGATABLE_PATHS = [
  { path: "uses", description: "Uses per day (casts, charges, etc.)", type: "number" as const, allowedEntityTypes: ALLOWED_ENTITY_TYPES },
  { path: "allowed", description: "Slots for known spells or feats", type: "number" as const, allowedEntityTypes: ALLOWED_ENTITY_TYPES },
];

export const ALLOWED_ALL = -1;

export type AptitudeLevelData = {
  uses: number;
  allowed: number;
  spent: number;
  available: number;
};

export type DetailedCharacterComprehensiveAptitudes = {
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

export default class DetailedCharacterAptitudes {
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
    const operators = kind === "modifier"
      ? ["add", "subtract", "multiply", "divide", "set"]
      : ["equal", "not_equal", "greater_than", "less_than", "greater_than_or_equal", "less_than_or_equal"];

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
          });
        }
      }
    }

    return paths;
  }

  private readonly detailedCharacterComprehensiveAptitudes:
    DetailedCharacterComprehensiveAptitudes = {};

  // Track which aptitude keys are leveled (spell aptitudes)
  private readonly leveledAptitudeKeys = new Set<string>();

  constructor(
    private readonly characterIdentity: DetailedCharacterIdentity,
    private readonly characterClasses: DetailedCharacterClasses,
    /** Largest spell/power level a leveled aptitude enumerates (inclusive).
     *  Required — each ruleset must pass its own value (e.g.
     *  `Dnd35LevelsHooks.MAX_SPELL_LEVEL`). No default so a universal file
     *  never carries a ruleset-specific constant. */
    private readonly maxSpellLevel: number,
  ) {}

  initialize(
    aptitudes: Aptitude[],
    klassLevelFeatCountsByAptitudeId: Record<string, number>,
    klassLevelPowerCountsByAptitudeId: Record<string, number> = {},
    leveledAptitudeIds: Set<string> = new Set(),
  ) {
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

      // Create per-level sub-entries for leveled aptitudes
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

    const level = this.characterIdentity.getIdentity().meta.level;

    const generalAptitudeAmount = level === 0 ? 0 : Math.floor(level / 3) + 1;

    // Count feats and powers taken for each aptitude (exclude free powers)
    // For leveled aptitudes, count per-level spent
    const spentByAptitudeId: Record<string, number> = {};
    const spentByAptitudeIdAndLevel: Record<string, Record<number, number>> = {};
    const classes = this.characterClasses.getClasses();

    for (const klass of Object.values(classes)) {
      for (const level of klass.levels) {
        for (const feat of level.feats) {
          spentByAptitudeId[feat.aptitudeId] = (spentByAptitudeId[feat.aptitudeId] || 0) + 1;
        }
        for (const power of level.powers) {
          if (!power.free) {
            if (power.powerLevel != null) {
              // Per-level spent for spell aptitudes
              if (!spentByAptitudeIdAndLevel[power.aptitudeId]) {
                spentByAptitudeIdAndLevel[power.aptitudeId] = {};
              }
              spentByAptitudeIdAndLevel[power.aptitudeId][power.powerLevel] =
                (spentByAptitudeIdAndLevel[power.aptitudeId][power.powerLevel] || 0) + 1;
            } else {
              // Flat spent for non-leveled aptitudes
              spentByAptitudeId[power.aptitudeId] = (spentByAptitudeId[power.aptitudeId] || 0) + 1;
            }
          }
        }
      }
    }

    // Build reverse map for O(1) lookups by aptitude ID
    const aptitudeById = new Map<string, DetailedCharacterComprehensiveAptitudes[string]>();
    for (const aptitude of Object.values(this.detailedCharacterComprehensiveAptitudes)) {
      aptitudeById.set(aptitude.id, aptitude);
    }

    // Set allowed for automatic class-level feats
    for (const [aptitudeId, count] of Object.entries(klassLevelFeatCountsByAptitudeId)) {
      const aptitude = aptitudeById.get(aptitudeId);
      if (aptitude) {
        aptitude.allowed += count;
      }
    }

    // Set allowed for automatic class-level powers (non-free only)
    for (const [aptitudeId, count] of Object.entries(klassLevelPowerCountsByAptitudeId)) {
      const aptitude = aptitudeById.get(aptitudeId);
      if (aptitude) {
        aptitude.allowed += count;
      }
    }

    const generalAptitude = this.detailedCharacterComprehensiveAptitudes["general"];
    generalAptitude.allowed += generalAptitudeAmount;

    // Set flat spent for non-leveled aptitudes
    for (const [aptitudeId, count] of Object.entries(spentByAptitudeId)) {
      const aptitude = aptitudeById.get(aptitudeId);
      if (aptitude) {
        aptitude.spent = count;
        aptitude.available = aptitude.allowed - aptitude.spent;
      }
    }

    // Set per-level spent for leveled (spell) aptitudes
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

    this.updateAvailables();
  }

  getAptitudes() {
    return this.detailedCharacterComprehensiveAptitudes;
  }

  getAptitude(name: string) {
    return this.detailedCharacterComprehensiveAptitudes[stripSeparators(name)];
  }

  isLeveledAptitude(key: string): boolean {
    return this.leveledAptitudeKeys.has(key);
  }

  /**
   * Extracts non-leveled aptitude pools formatted for feat selection.
   * Returns pool objects keyed by aptitude ID.
   */
  extractFeatPools(): Record<string, { id: string; name: string; allowed: number; spent: number; available: number; shared: boolean }> {
    const pools: Record<string, { id: string; name: string; allowed: number; spent: number; available: number; shared: boolean }> = {};
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
  extractPowerPools(): Record<string, {
    id: string; name: string; allowed: number; spent: number; available: number;
    leveled?: boolean;
    levels?: Record<string, { allowed: number; spent: number; available: number }>;
  }> {
    const pools: Record<string, {
      id: string; name: string; allowed: number; spent: number; available: number;
      leveled?: boolean;
      levels?: Record<string, { allowed: number; spent: number; available: number }>;
    }> = {};

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

  /** Returns IDs of all non-leveled aptitudes. */
  getNonLeveledAptitudeIds(): string[] {
    return Object.entries(this.detailedCharacterComprehensiveAptitudes)
      .filter(([key]) => !this.leveledAptitudeKeys.has(key))
      .map(([, apt]) => apt.id);
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
}
