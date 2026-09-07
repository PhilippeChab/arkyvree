import type { CachedRulesetData } from "@/server/cache/rulesetCache.ts";
import { db, type Db } from "@/server/database/index.ts";
import { withRulesetScope } from "@/server/services/rulesets/cow.ts";
import type {
  DetailedCharacterInterface,
  FeatWithPMR,
  Holders,
  InventoryEntry,
  KlassLevelWithPMR,
  LoadedCharacterData,
  PowerWithPMR,
  PreloadedCharacterData,
  PreloadedRulesetData,
  RaceWithPMR,
  RequirementIssue,
  SkillWithRank,
  TargetPathsTraverser,
} from "@/server/rulesets/types.ts";
import type DetailedCharacterAbilities from "@/server/rulesets/universal/DetailedCharacterAbilities.ts";
import { ALLOWED_ALL } from "@/server/rulesets/universal/DetailedCharacterAptitudes.ts";
import type DetailedCharacterAptitudes from "@/server/rulesets/universal/DetailedCharacterAptitudes.ts";
import type DetailedCharacterClasses from "@/server/rulesets/universal/DetailedCharacterClasses.ts";
import type DetailedCharacterFeatGroupings from "@/server/rulesets/universal/DetailedCharacterFeatGroupings.ts";
import type DetailedCharacterFeats from "@/server/rulesets/universal/DetailedCharacterFeats.ts";
import type DetailedCharacterModifiers from "@/server/rulesets/universal/DetailedCharacterModifiers.ts";
import type DetailedCharacterIdentity from "@/server/rulesets/universal/DetailedCharacterIdentity.ts";
import type DetailedCharacterPowerGroupings from "@/server/rulesets/universal/DetailedCharacterPowerGroupings.ts";
import type DetailedCharacterPowers from "@/server/rulesets/universal/DetailedCharacterPowers.ts";
import DetailedCharacterRequirements from "@/server/rulesets/universal/DetailedCharacterRequirements.ts";
import type DetailedCharacterSavingThrows from "@/server/rulesets/universal/DetailedCharacterSavingThrows.ts";
import type {
  Aptitude,
  Campaign,
  Character,
  CharacterLevel,
  Feat,
  Klass,
  KlassLevelSave,
  KlassSkill,
  Language,
  Modifier,
  Player,
  PowerWithAptitudes,
  Property,
  Requirement,
  Ruleset,
  RulesetAbility,
  RulesetSave,
  Skill,
} from "@/shared/relations.ts";

export type ValidationIssue = {
  category: "aptitudes" | "skills" | "requirements" | "modifiers" | "integrity";
  message: string;
  entityName?: string;
  entityType?: string;
  requirementTree?: string;
};

export type ValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
};

/**
 * Data loader interface that ruleset implementations must provide.
 * Handles DB fetching of character-level data + PMR distribution. Ruleset-
 * level data (`ruleset`, `cowData`, `rulesetData`) is always supplied by the
 * caller via `withRulesetScope` — the loader never fetches it itself.
 */
export interface DataLoader {
  loadSharedData(database: Db | undefined, preloaded: PreloadedRulesetData): Promise<PreloadedRulesetData>;
  load(database: Db | undefined, projectedData: unknown | undefined, preloaded: PreloadedCharacterData | PreloadedRulesetData): Promise<LoadedCharacterData>;
}

export default abstract class AbstractDetailedCharacter implements DetailedCharacterInterface {
  // ── Context data ──────────────────────────────────────────────────
  protected ruleset: Ruleset | undefined = undefined;
  protected player: Player | undefined = undefined;
  protected campaign: Campaign | undefined = undefined;

  // ── Ruleset data ──────────────────────────────────────────────────
  protected rulesetAbilities: RulesetAbility[] = [];
  protected rulesetSaves: RulesetSave[] = [];
  protected rulesetSkills: Skill[] = [];
  protected rulesetFeats: Feat[] = [];
  protected rulesetPowers: PowerWithAptitudes[] = [];
  protected rulesetPowerProperties: Property[] = [];
  protected rulesetAptitudes: Aptitude[] = [];
  protected rulesetKlasses: Klass[] = [];

  // ── Character data ────────────────────────────────────────────────
  protected race: RaceWithPMR = {} as RaceWithPMR;
  protected languages: Language[] = [];
  protected inventory: InventoryEntry[] = [];
  protected characterAbilityScores: { abilityId: string; name: string; score: number }[] = [];
  protected characterLevels: CharacterLevel[] = [];
  protected klassLevels: KlassLevelWithPMR[] = [];
  protected klassSkills: KlassSkill[] = [];
  protected klassLevelSaves: KlassLevelSave[] = [];
  protected klasses: Klass[] = [];
  protected feats: FeatWithPMR[] = [];
  protected skills: SkillWithRank[] = [];
  protected powers: PowerWithPMR[] = [];

  // ── Derived data ──────────────────────────────────────────────────
  protected klassLevelFeatCountsByAptitudeId: Record<string, number> = {};
  protected klassLevelPowerCountsByAptitudeId: Record<string, number> = {};
  protected leveledAptitudeIds: Set<string> = new Set();

  // ── Modifier/requirement collections ──────────────────────────────
  protected holders: Holders | null = null;
  protected modifiers: Modifier[] = [];
  protected requirementGroups: Requirement[][] = [];
  protected validRulesetIds = new Set<string>();

  // ── Universal sub-systems (initialized by subclass constructor) ──
  protected detailedCharacterAbilities!: DetailedCharacterAbilities;
  protected detailedCharacterClasses!: DetailedCharacterClasses;
  protected detailedCharacterFeats!: DetailedCharacterFeats;
  protected detailedCharacterFeatGroupings!: DetailedCharacterFeatGroupings;
  protected detailedCharacterPowers!: DetailedCharacterPowers;
  protected detailedCharacterPowerGroupings!: DetailedCharacterPowerGroupings;
  protected detailedCharacterAptitudes!: DetailedCharacterAptitudes;
  protected detailedCharacterSavingThrows!: DetailedCharacterSavingThrows;
  protected detailedCharacterModifiers!: DetailedCharacterModifiers;
  protected detailedCharacterIdentity!: DetailedCharacterIdentity;
  protected detailedCharacterRequirements!: DetailedCharacterRequirements;
  protected targetPaths!: TargetPathsTraverser;

  constructor(protected readonly character: Character) {}

  /** Create the data loader for this ruleset. */
  protected abstract createDataLoader(): DataLoader;

  /** Initialize all sub-systems from loaded data. Order matters. */
  protected abstract normalizeData(): void;

  /** Build the holders map — universal holders + ruleset-specific ones. */
  protected abstract buildHolders(): Holders;

  /** Ruleset-specific setup before requirement evaluation (e.g. spellcasting holder). */
  protected abstract preRequirementProcessing(): void;

  /** Ruleset-specific processing after requirements, before modifiers (e.g. proficiency penalties). */
  protected abstract postRequirementProcessing(): void;

  /** Ruleset-specific processing after non-power modifiers are applied. */
  protected abstract postModifierProcessing(rulesetData: CachedRulesetData): Promise<void>;

  /** Resolve entity name for ruleset-specific entity types. */
  abstract resolveEntityName(entityId: string, entityType: string): string | undefined;

  /** Resolve modifier source name. */
  abstract resolveModifierSourceName(modifier: Modifier): { name: string; type: string } | undefined;

  /** Getters for ruleset-specific sub-systems and data. Subclass adds its own. */
  abstract getVirtuallyPossessedPowerIds(): string[];
  abstract getVirtuallyPossessedPowersWithAptitudes(): unknown[];
  abstract getSpellTags(): Record<string, string[]>;
  abstract getSpellcasting(): { arcane: number; divine: number };

  // ── Template build pipeline ───────────────────────────────────────

  async preload(): Promise<PreloadedCharacterData> {
    const dataLoader = this.createDataLoader();
    return await withRulesetScope(db, this.character.rulesetId, async ({ ruleset, rulesetData }) => {
      const shared = await dataLoader.loadSharedData(db, { ruleset, cowData: rulesetData.cow, rulesetData });
      return {
        ruleset,
        cowData: shared.cowData,
        rulesetData: shared.rulesetData,
        _shared: shared,
      };
    });
  }

  async build(
    database: Db = db,
    projectedData?: unknown,
    preloaded?: PreloadedCharacterData | PreloadedRulesetData,
  ) {
    const dataLoader = this.createDataLoader();

    // withRulesetScope activates the cowContext, loads ruleset + cowData +
    // rulesetData, and hands them back. The data loader requires preloaded
    // ruleset-level data — never fetches on its own. Projection mode's
    // caller-supplied `preloaded` with `_shared` still takes precedence.
    return await withRulesetScope(database, this.character.rulesetId, async ({ ruleset, rulesetData }) => {
      const preloadedForLoad: PreloadedCharacterData | PreloadedRulesetData = preloaded && "_shared" in preloaded
        ? preloaded
        : { ruleset, cowData: rulesetData.cow, rulesetData };
      // 1. Load data
      const data = await dataLoader.load(database, projectedData, preloadedForLoad);
      this.applyLoadedData(data);

      // 2. Normalize (subclass — initializes all sub-systems)
      this.normalizeData();

      // 3. Pre-apply possession modifiers (universal)
      this.preApplyPossessionModifiers();

      // 4. Build holders (subclass — includes ruleset-specific holders)
      this.holders = this.buildHolders();

      // 5. Pre-requirement processing (subclass — e.g. spellcasting holder init)
      this.preRequirementProcessing();

      // 6. Evaluate requirements (universal)
      this.detailedCharacterRequirements.evaluateRequirements(
        this.holders,
        this.requirementGroups.filter((group) => group.length > 0),
      );

      // 7. Post-requirement processing (subclass — e.g. proficiency penalties)
      this.postRequirementProcessing();

      // 8. Evaluate non-power modifiers (universal)
      const powerModifiers = this.modifiers.filter((m) =>
        m.target.startsWith("powers."),
      );
      const otherModifiers = this.modifiers.filter(
        (m) => !m.target.startsWith("powers."),
      );
      this.detailedCharacterModifiers.evaluateModifiers(
        this.holders,
        otherModifiers,
        this.detailedCharacterRequirements,
      );

      // 9. Refresh universal ability-dependent sub-systems
      this.detailedCharacterSavingThrows.refreshAbilityModifiers();

      // 10. Ruleset-specific post-modifier processing (subclass)
      await this.postModifierProcessing(rulesetData);

      // 11. Evaluate power modifiers (universal)
      this.detailedCharacterModifiers.evaluateModifiers(
        this.holders,
        powerModifiers,
        this.detailedCharacterRequirements,
      );
    });
  }

  // ── Universal concrete methods ────────────────────────────────────

  protected applyLoadedData(data: LoadedCharacterData) {
    this.ruleset = data.ruleset;
    this.player = data.player;
    this.campaign = data.campaign;
    this.rulesetAbilities = data.rulesetAbilities;
    this.rulesetSaves = data.rulesetSaves;
    this.rulesetSkills = data.rulesetSkills;
    this.rulesetFeats = data.rulesetFeats;
    this.rulesetPowers = data.rulesetPowers;
    this.rulesetPowerProperties = data.rulesetPowerProperties;
    this.rulesetAptitudes = data.rulesetAptitudes;
    this.rulesetKlasses = data.rulesetKlasses;
    this.leveledAptitudeIds = data.leveledAptitudeIds;
    this.characterAbilityScores = data.characterAbilityScores;
    this.race = data.race;
    this.languages = data.languages;
    this.inventory = data.inventory;
    this.characterLevels = data.characterLevels;
    this.klassLevels = data.klassLevels;
    this.klassSkills = data.klassSkills;
    this.klassLevelSaves = data.klassLevelSaves;
    this.klasses = data.klasses;
    this.feats = data.feats;
    this.skills = data.skills;
    this.powers = data.powers;
    this.klassLevelFeatCountsByAptitudeId = data.klassLevelFeatCountsByAptitudeId;
    this.klassLevelPowerCountsByAptitudeId = data.klassLevelPowerCountsByAptitudeId;
    this.modifiers = data.modifiers;
    this.requirementGroups = data.requirementGroups;
    this.validRulesetIds = data.validRulesetIds;
  }

  protected preApplyPossessionModifiers() {
    for (const mod of this.modifiers) {
      if (
        mod.operator !== "set" ||
        mod.valueType !== "boolean" ||
        mod.value !== "true"
      )
        continue;

      const parts = mod.target.split(".");

      // feats.<slug>.possessed
      if (parts.length === 3 && parts[0] === "feats" && parts[2] === "possessed") {
        const feat = this.detailedCharacterFeats.getFeat(parts[1]);
        if (feat && !feat.possessed) {
          feat.possessed = true;
          feat.count += 1;
        }
        continue;
      }

      // powers.<spellSlug>.<aptSlug>.known
      if (parts.length === 4 && parts[0] === "powers" && parts[3] === "known") {
        const spell = this.detailedCharacterPowers.getSpellEntry(parts[1], parts[2]);
        if (spell && !spell.known) {
          spell.known = true;
        }
      }
    }
  }

  areRequirementsMet(requirementGroups: Requirement[][]): boolean {
    if (!this.holders) return false;

    const tempRequirements = new DetailedCharacterRequirements(
      this.targetPaths,
    );
    const nonEmpty = requirementGroups.filter((group) => group.length > 0);
    if (nonEmpty.length === 0) return true;

    tempRequirements.evaluateRequirements(this.holders, nonEmpty);
    const { unmetRequirementGroups, invalidRequirements } =
      tempRequirements.getRequirements();
    return (
      unmetRequirementGroups.length === 0 && invalidRequirements.length === 0
    );
  }

  getUnmetRequirementIssues(
    requirementGroups: Requirement[][],
  ): RequirementIssue[] {
    if (!this.holders) return [];

    const tempRequirements = new DetailedCharacterRequirements(
      this.targetPaths,
    );
    const nonEmpty = requirementGroups.filter((group) => group.length > 0);
    if (nonEmpty.length === 0) return [];

    tempRequirements.evaluateRequirements(this.holders, nonEmpty);
    const { unmetRequirementGroups, invalidRequirements } =
      tempRequirements.getRequirements();
    const issues: RequirementIssue[] = [];

    for (const group of unmetRequirementGroups) {
      const firstReq = group[0];
      const entityName = this.resolveEntityName(
        firstReq.entityId,
        firstReq.entityType,
      );
      const targets = group.filter((r) => r.target).map((r) => r.target);
      const label = entityName
        ? `Unmet prerequisite on ${entityName} (${firstReq.entityType})`
        : `Unmet prerequisite: ${targets.join(", ") || "unknown"}`;
      issues.push({
        category: "requirements",
        message: label,
        entityName,
        entityType: firstReq.entityType,
        requirementTree: this.formatRequirements(group),
      });
    }
    for (const { warning, requirement } of invalidRequirements) {
      const entityName = this.resolveEntityName(
        requirement.entityId,
        requirement.entityType,
      );
      issues.push({
        category: "requirements",
        message: entityName
          ? `Invalid requirement on ${entityName} (${requirement.entityType}): ${warning}`
          : `Invalid requirement: ${warning}`,
        entityName,
        entityType: requirement.entityType,
      });
    }

    return issues;
  }

  validate(): ValidationResult {
    const issues: ValidationIssue[] = [];

    // Check aptitudes: each should have available === 0
    const aptitudes = this.detailedCharacterAptitudes.getAptitudes();
    for (const [key, aptitude] of Object.entries(aptitudes)) {
      if (this.detailedCharacterAptitudes.isLeveledAptitude(key)) {
        const aptitudeObj = aptitude as Record<string, unknown>;
        for (let level = 0; level <= 9; level++) {
          const levelData = aptitudeObj[String(level)] as
            | { allowed: number; spent: number; available: number }
            | undefined;
          if (!levelData || (levelData.allowed === 0 && levelData.spent === 0))
            continue;
          if (levelData.allowed === ALLOWED_ALL) continue;
          if (levelData.available > 0) {
            issues.push({
              category: "aptitudes",
              message: `${aptitude.name} (level ${level}): ${levelData.available} unspent slot(s) (${levelData.spent}/${levelData.allowed})`,
            });
          } else if (levelData.available < 0) {
            issues.push({
              category: "aptitudes",
              message: `${aptitude.name} (level ${level}): overspent by ${Math.abs(levelData.available)} (${levelData.spent}/${levelData.allowed})`,
            });
          }
        }
      } else {
        if (aptitude.allowed === ALLOWED_ALL) continue;
        if (aptitude.available > 0) {
          issues.push({
            category: "aptitudes",
            message: `${aptitude.name}: ${aptitude.available} unspent slot(s) (${aptitude.spent}/${aptitude.allowed})`,
          });
        } else if (aptitude.available < 0) {
          issues.push({
            category: "aptitudes",
            message: `${aptitude.name}: overspent by ${Math.abs(aptitude.available)} (${aptitude.spent}/${aptitude.allowed})`,
          });
        }
      }
    }

    // Check unmet requirements (skip modifier/item requirements)
    const { unmetRequirementGroups, invalidRequirements } =
      this.detailedCharacterRequirements.getRequirements();
    for (const group of unmetRequirementGroups) {
      if (group.every((r) => r.entityType === "modifiers")) continue;
      if (group.every((r) => r.entityType === "items")) continue;
      const firstReq =
        group.find((r) => r.entityType !== "modifiers") ?? group[0];
      const entityName = this.resolveEntityName(
        firstReq.entityId,
        firstReq.entityType,
      );
      const targets = group.filter((r) => r.target).map((r) => r.target);
      const label = entityName
        ? `Unmet prerequisite on ${entityName} (${firstReq.entityType})`
        : `Unmet prerequisite: ${targets.join(", ") || "unknown"}`;
      issues.push({
        category: "requirements",
        message: label,
        entityName,
        entityType: firstReq.entityType,
        requirementTree: this.formatRequirements(group),
      });
    }
    for (const { warning, requirement } of invalidRequirements) {
      const entityName = this.resolveEntityName(
        requirement.entityId,
        requirement.entityType,
      );
      issues.push({
        category: "requirements",
        message: entityName
          ? `Invalid requirement on ${entityName} (${requirement.entityType}): ${warning}`
          : `Invalid requirement: ${warning}`,
        entityName,
        entityType: requirement.entityType,
      });
    }

    // Check modifier issues
    const { skippedModifiers, unappliedModifiers } =
      this.detailedCharacterModifiers.getModifiers();
    for (const modifier of unappliedModifiers) {
      const isConditional = unmetRequirementGroups.some((group) =>
        group.every(
          (r) => r.entityType === "modifiers" && r.entityId === modifier.id,
        ),
      );
      if (isConditional) continue;
      const source = this.resolveModifierSourceName(modifier);
      issues.push({
        category: "modifiers",
        message: source
          ? `Unapplied modifier on ${modifier.target} from ${source.name} (${source.type})`
          : `Unapplied modifier on ${modifier.target} (blocked by unmet requirements)`,
        entityName: source?.name,
        entityType: source?.type,
      });
    }
    for (const { warning, modifier } of skippedModifiers) {
      const source = this.resolveModifierSourceName(modifier);
      issues.push({
        category: "modifiers",
        message: source
          ? `Skipped modifier on ${modifier.target} from ${source.name} (${source.type}): ${warning}`
          : `Skipped modifier: ${warning}`,
        entityName: source?.name,
        entityType: source?.type,
      });
    }

    // Check referential integrity
    const sourceChain = (
      rulesetId: string,
      name: string,
      entityType: string,
    ) => {
      if (!this.validRulesetIds.has(rulesetId)) {
        issues.push({
          category: "integrity",
          message: `${entityType} "${name}" belongs to a ruleset not in this character's source chain`,
          entityName: name,
          entityType,
        });
      }
    };
    sourceChain(this.race.rulesetId, this.race.name, "races");
    for (const klass of this.klasses)
      sourceChain(klass.rulesetId, klass.name, "klasses");
    for (const skill of this.skills)
      sourceChain(skill.rulesetId, skill.name, "skills");
    for (const feat of this.feats)
      sourceChain(feat.rulesetId, feat.name, "feats");
    for (const power of this.powers)
      sourceChain(power.rulesetId, power.name, "powers");
    for (const inv of this.inventory)
      sourceChain(inv.item.rulesetId, inv.item.name, "items");

    return { valid: issues.length === 0, issues };
  }

  // ── Universal getters ─────────────────────────────────────────────

  getRuleset() {
    return this.ruleset;
  }

  getPlayer() {
    return this.player;
  }

  getCampaign() {
    return this.campaign;
  }

  getDetailedCharacterClasses() {
    return this.detailedCharacterClasses;
  }

  getDetailedCharacterIdentity() {
    return this.detailedCharacterIdentity;
  }

  getDetailedCharacterAbilities() {
    return this.detailedCharacterAbilities;
  }

  getDetailedCharacterSavingThrows() {
    return this.detailedCharacterSavingThrows;
  }

  getDetailedCharacterFeats() {
    return this.detailedCharacterFeats;
  }

  getDetailedCharacterPowers() {
    return this.detailedCharacterPowers;
  }

  getDetailedCharacterFeatGroupings() {
    return this.detailedCharacterFeatGroupings;
  }

  getDetailedCharacterPowerGroupings() {
    return this.detailedCharacterPowerGroupings;
  }

  getDetailedCharacterAptitudes() {
    return this.detailedCharacterAptitudes;
  }

  getDetailedCharacterModifiers() {
    return this.detailedCharacterModifiers;
  }

  getDetailedCharacterRequirements() {
    return this.detailedCharacterRequirements;
  }

  getVirtuallyPossessedFeatIds() {
    return this.feats.filter((f) => f.virtual).map((f) => f.id);
  }

  getVirtuallyPossessedFeats() {
    return this.feats.filter((f) => f.virtual);
  }

  // ── Requirement formatting ────────────────────────────────────────

  private static readonly OPERATOR_SYMBOLS: Record<string, string> = {
    equal: "=",
    not_equal: "!=",
    greater_than: ">",
    less_than: "<",
    greater_than_or_equal: ">=",
    less_than_or_equal: "<=",
    contains: "contains",
    not_contains: "not contains",
    starts_with: "starts with",
    ends_with: "ends with",
    is_empty: "is empty",
    not_empty: "is not empty",
  };

  formatRequirements(requirements: Requirement[]): string {
    type TreeNode = { requirement: Requirement; children: TreeNode[] };

    const nodeMap = new Map<string, TreeNode>();
    const sorted = [...requirements].sort((a, b) => parseFloat(a.level) - parseFloat(b.level));

    for (const req of sorted) {
      nodeMap.set(req.level, { requirement: req, children: [] });
    }

    const roots: TreeNode[] = [];
    for (const req of sorted) {
      const parts = req.level.split(".");
      if (parts.length === 1) {
        roots.push(nodeMap.get(req.level)!);
      } else {
        const parentLevel = parts.slice(0, -1).join(".");
        const parent = nodeMap.get(parentLevel);
        if (parent) {
          parent.children.push(nodeMap.get(req.level)!);
        } else {
          roots.push(nodeMap.get(req.level)!);
        }
      }
    }

    const isLeafMet = (req: Requirement): boolean => {
      if (!req.target || !this.holders) return false;
      const results = this.targetPaths.traversePathInit(req.target, this.holders);
      return results.some((result) => {
        if (result.error) return false;
        const { data } = result as { data: unknown };
        let typedValue: number | string | boolean;
        switch (req.valueType) {
          case "number": typedValue = Number(req.value); break;
          case "boolean": typedValue = req.value === "true"; break;
          default: typedValue = String(req.value); break;
        }
        switch (req.operator) {
          case "equal": return data === typedValue;
          case "not_equal": return data !== typedValue;
          case "greater_than": return typeof data === "number" && data > (typedValue as number);
          case "less_than": return typeof data === "number" && data < (typedValue as number);
          case "greater_than_or_equal": return typeof data === "number" && data >= (typedValue as number);
          case "less_than_or_equal": return typeof data === "number" && data <= (typedValue as number);
          case "contains":
            return typeof data === "string"
              ? data.includes(typedValue as string)
              : Array.isArray(data) && data.includes(typedValue);
          case "not_contains":
            return typeof data === "string"
              ? !data.includes(typedValue as string)
              : Array.isArray(data) && !data.includes(typedValue);
          default: return false;
        }
      });
    };

    const formatNode = (node: TreeNode, indent: string): string => {
      const req = node.requirement;
      if (req.chainingOperator) {
        const label = `(${req.chainingOperator.toUpperCase()})`;
        const childLines = node.children.map((child) => formatNode(child, indent + "  ")).join("\n");
        return `${indent}${label}\n${childLines}`;
      }
      const op = AbstractDetailedCharacter.OPERATOR_SYMBOLS[req.operator ?? ""] ?? req.operator ?? "?";
      const isMet = isLeafMet(req);
      const marker = isMet ? "" : "  [UNMET]";
      return `${indent}${req.target} ${op} ${req.value}${marker}`;
    };

    return roots.map((root) => formatNode(root, "")).join("\n");
  }
}
