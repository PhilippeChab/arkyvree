import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";
import { db, type Db } from "@/server/database/index.ts";
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
import type DetailedCharacterIdentity from "@/server/rulesets/universal/DetailedCharacterIdentity.ts";
import DetailedCharacterModifiers from "@/server/rulesets/universal/DetailedCharacterModifiers.ts";
import type DetailedCharacterPowerGroupings from "@/server/rulesets/universal/DetailedCharacterPowerGroupings.ts";
import type DetailedCharacterPowers from "@/server/rulesets/universal/DetailedCharacterPowers.ts";
import DetailedCharacterRequirements from "@/server/rulesets/universal/DetailedCharacterRequirements.ts";
import type DetailedCharacterSavingThrows from "@/server/rulesets/universal/DetailedCharacterSavingThrows.ts";
import { isTemplateValue } from "@/server/rulesets/universal/templateExpression.ts";
import { withRulesetScope } from "@/server/services/rulesets/cow/index.ts";
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

/** An aptitude pool's (or one of its spell levels') slots. */
type AptitudeSlots = { allowed: number; spent: number; available: number };

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
  load(
    database: Db | undefined,
    projectedData: unknown | undefined,
    preloaded: PreloadedCharacterData | PreloadedRulesetData,
  ): Promise<LoadedCharacterData>;
}

export default abstract class AbstractDetailedCharacter implements DetailedCharacterInterface {
  constructor(protected readonly character: Character) {}

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

  // ── Context data ──────────────────────────────────────────────────
  protected ruleset: Ruleset | undefined = undefined;

  protected player: Player | undefined = undefined;

  protected campaign: Campaign | undefined = undefined;

  // ── Ruleset data ──────────────────────────────────────────────────
  protected rulesetAbilities: RulesetAbility[] = [];

  protected rulesetSaves: RulesetSave[] = [];

  protected rulesetSkills: Skill[] = [];

  protected rulesetFeats: Feat[] = [];

  protected rulesetFeatProperties: Property[] = [];

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

  /** The gated modifiers applied while their requirements held, whose requirements don't hold on the final sheet. */
  private modifiersPastTheirGates: Modifier[] = [];

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

  /** Build the holders map — universal holders + ruleset-specific ones. */
  protected abstract buildHolders(): Holders;

  protected applyLoadedData(data: LoadedCharacterData) {
    this.ruleset = data.ruleset;
    this.player = data.player;
    this.campaign = data.campaign;
    this.rulesetAbilities = data.rulesetAbilities;
    this.rulesetSaves = data.rulesetSaves;
    this.rulesetSkills = data.rulesetSkills;
    this.rulesetFeats = data.rulesetFeats;
    this.rulesetFeatProperties = data.rulesetFeatProperties;
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

  /**
   * Applies the modifiers in rounds, so a modifier's requirements read the sheet the other modifiers have already
   * changed (an item's Strength counts toward a feat's prerequisite): first those no requirement gates, then, round
   * after round, the gated ones whose requirements the sheet now meets, until a round applies none. Each round checks
   * only the requirements gating a modifier still waiting. A template modifier, which reads the sheet, applies last.
   * The requirements are evaluated once more on the final sheet: the evaluation the templates, the power modifiers and
   * the validation read.
   */
  private applyModifiersInRounds(modifiers: Modifier[]): void {
    const holders = this.holders!;
    const groups = this.requirementGroups.filter((group) => group.length > 0);
    const gateKey = (r: Requirement) => `${r.entityId}:${r.entityType}`;
    const keysOf = (m: Modifier) => [`${m.sourceId}:${m.sourceType}`, `${m.id}:modifiers`];
    const gateKeys = new Set(groups.flatMap((group) => group.map(gateKey)));
    const literal = modifiers.filter((m) => !isTemplateValue(m.value));

    for (const modifier of literal.filter((m) => !keysOf(m).some((key) => gateKeys.has(key)))) {
      this.detailedCharacterModifiers.evaluateModifier(modifier, holders);
    }
    let waiting = literal.filter((m) => keysOf(m).some((key) => gateKeys.has(key)));
    const appliedGated: Modifier[] = [];
    while (waiting.length > 0) {
      const waitingKeys = new Set(waiting.flatMap(keysOf));
      const round = new DetailedCharacterRequirements(this.targetPaths);
      round.evaluateRequirements(
        holders,
        groups.filter((group) => group.some((r) => waitingKeys.has(gateKey(r)))),
      );
      const blocked = DetailedCharacterModifiers.blockedKeys(round);
      const ready = waiting.filter((m) => !keysOf(m).some((key) => blocked.has(key)));
      if (ready.length === 0) break;
      for (const modifier of ready) this.detailedCharacterModifiers.evaluateModifier(modifier, holders);
      appliedGated.push(...ready);
      waiting = waiting.filter((m) => !ready.includes(m));
    }

    this.detailedCharacterRequirements.evaluateRequirements(holders, groups);
    // A modifier can break a requirement already met, another's or its own: the modifiers it gated stay applied (undoing
    // them could loop, two modifiers breaking each other's), and validation reports them. A ready one a round skipped,
    // or that reached nothing, didn't apply
    const blockedAtTheEnd = DetailedCharacterModifiers.blockedKeys(this.detailedCharacterRequirements);
    const appliedIds = new Set(this.detailedCharacterModifiers.getModifiers().appliedModifiers.map((m) => m.id));
    this.modifiersPastTheirGates = appliedGated.filter(
      (m) => appliedIds.has(m.id) && keysOf(m).some((key) => blockedAtTheEnd.has(key)),
    );
    // The modifiers still waiting are recorded as gated out; the templates apply, or are, by the final evaluation
    this.detailedCharacterModifiers.evaluateModifiers(
      holders,
      [...waiting, ...modifiers.filter((m) => isTemplateValue(m.value))],
      this.detailedCharacterRequirements,
    );
  }

  /** Create the data loader for this ruleset. */
  protected abstract createDataLoader(): DataLoader;

  private invalidRequirementIssue({
    warning,
    requirement,
  }: {
    warning: string;
    requirement: Requirement;
  }): RequirementIssue {
    const entityName = this.resolveEntityName(requirement.entityId, requirement.entityType);
    return {
      category: "requirements",
      message: entityName
        ? `Invalid requirement on ${entityName} (${requirement.entityType}): ${warning}`
        : `Invalid requirement: ${warning}`,
      entityName,
      entityType: requirement.entityType,
    };
  }

  /** Initialize all sub-systems from loaded data. Order matters. */
  protected abstract normalizeData(): void;

  /** Ruleset-specific processing after non-power modifiers are applied. */
  protected abstract postModifierProcessing(rulesetData: CachedRulesetData): Promise<void>;

  /** Ruleset-specific processing after requirements, before modifiers (e.g. proficiency penalties). */
  protected abstract postRequirementProcessing(): void;

  protected preApplyPossessionModifiers() {
    for (const mod of this.modifiers) {
      if (mod.operator !== "set" || mod.valueType !== "boolean" || mod.value !== "true") continue;

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

  /** Ruleset-specific setup before requirement evaluation (e.g. spellcasting holder). */
  protected abstract preRequirementProcessing(rulesetData: CachedRulesetData): Promise<void>;

  /** An unmet requirement group's issue: on the entity of `owner`, one of its requirements, or naming its targets. */
  private unmetRequirementIssue(group: Requirement[], owner: Requirement): RequirementIssue {
    const entityName = this.resolveEntityName(owner.entityId, owner.entityType);
    const targets = group.filter((r) => r.target).map((r) => r.target);
    return {
      category: "requirements",
      message: entityName
        ? `Unmet prerequisite on ${entityName} (${owner.entityType})`
        : `Unmet prerequisite: ${targets.join(", ") || "unknown"}`,
      entityName,
      entityType: owner.entityType,
      requirementTree: this.formatRequirements(group),
    };
  }

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

  async build(database: Db = db, projectedData?: unknown, preloaded?: PreloadedCharacterData | PreloadedRulesetData) {
    const dataLoader = this.createDataLoader();

    // withRulesetScope activates the cowContext, loads ruleset + cowData +
    // rulesetData, and hands them back. The data loader requires preloaded
    // ruleset-level data — never fetches on its own. Projection mode's
    // caller-supplied `preloaded` with `_shared` still takes precedence.
    return await withRulesetScope(database, this.character.rulesetId, async ({ ruleset, rulesetData }) => {
      const preloadedForLoad: PreloadedCharacterData | PreloadedRulesetData =
        preloaded && "_shared" in preloaded ? preloaded : { ruleset, cowData: rulesetData.cow, rulesetData };
      // 1. Load data
      const data = await dataLoader.load(database, projectedData, preloadedForLoad);
      this.applyLoadedData(data);

      // 2. Normalize (subclass — initializes all sub-systems)
      this.normalizeData();

      // 3. Pre-apply possession modifiers (universal)
      this.preApplyPossessionModifiers();

      // 4. Build holders (subclass — includes ruleset-specific holders)
      this.holders = this.buildHolders();

      // 5. Pre-requirement processing (subclass — e.g. the spellcasting holder, a bonded creature's stat block)
      await this.preRequirementProcessing(rulesetData);

      // 6. Post-requirement processing (subclass — e.g. proficiency penalties, which check requirements of their own)
      this.postRequirementProcessing();

      // 7. Non-power modifiers, and the requirements that gate them (universal)
      const powerModifiers = this.modifiers.filter((m) => m.target.startsWith("powers."));
      const otherModifiers = this.modifiers.filter((m) => !m.target.startsWith("powers."));
      this.applyModifiersInRounds(otherModifiers);

      // 8. Ruleset-specific post-modifier processing (subclass)
      await this.postModifierProcessing(rulesetData);

      // 9. Evaluate power modifiers (universal)
      this.detailedCharacterModifiers.evaluateModifiers(
        this.holders,
        powerModifiers,
        this.detailedCharacterRequirements,
      );
    });
  }

  getCampaign() {
    return this.campaign;
  }

  getDetailedCharacterAbilities() {
    return this.detailedCharacterAbilities;
  }

  getDetailedCharacterAptitudes() {
    return this.detailedCharacterAptitudes;
  }

  getDetailedCharacterClasses() {
    return this.detailedCharacterClasses;
  }

  getDetailedCharacterFeats() {
    return this.detailedCharacterFeats;
  }

  getDetailedCharacterIdentity() {
    return this.detailedCharacterIdentity;
  }

  getDetailedCharacterModifiers() {
    return this.detailedCharacterModifiers;
  }

  getDetailedCharacterPowerGroupings() {
    return this.detailedCharacterPowerGroupings;
  }

  getDetailedCharacterPowers() {
    return this.detailedCharacterPowers;
  }

  getDetailedCharacterRequirements() {
    return this.detailedCharacterRequirements;
  }

  getDetailedCharacterSavingThrows() {
    return this.detailedCharacterSavingThrows;
  }

  getPlayer() {
    return this.player;
  }

  getRuleset() {
    return this.ruleset;
  }

  abstract getSpellTags(): Record<string, string[]>;

  abstract getSpellcasting(): { arcane: number; divine: number };

  getUnmetRequirementIssues(requirementGroups: Requirement[][]): RequirementIssue[] {
    if (!this.holders) return [];

    const tempRequirements = new DetailedCharacterRequirements(this.targetPaths);
    const nonEmpty = requirementGroups.filter((group) => group.length > 0);
    if (nonEmpty.length === 0) return [];

    tempRequirements.evaluateRequirements(this.holders, nonEmpty);
    const { unmetRequirementGroups, invalidRequirements } = tempRequirements.getRequirements();
    const issues: RequirementIssue[] = [];

    for (const group of unmetRequirementGroups) issues.push(this.unmetRequirementIssue(group, group[0]));
    for (const invalid of invalidRequirements) issues.push(this.invalidRequirementIssue(invalid));
    return issues;
  }

  getVirtuallyPossessedFeatIds() {
    return this.feats.filter((f) => f.virtual).map((f) => f.id);
  }

  getVirtuallyPossessedFeats() {
    return this.feats.filter((f) => f.virtual);
  }

  /** Getters for ruleset-specific sub-systems and data. Subclass adds its own. */
  abstract getVirtuallyPossessedPowerIds(): string[];

  abstract getVirtuallyPossessedPowersWithAptitudes(): unknown[];

  /** Resolve entity name for ruleset-specific entity types. */
  abstract resolveEntityName(entityId: string, entityType: string): string | undefined;

  /** Resolve modifier source name. */
  abstract resolveModifierSourceName(modifier: Modifier): { name: string; type: string } | undefined;

  validate(): ValidationResult {
    const issues: ValidationIssue[] = [];

    // Check aptitudes: each should have available === 0
    const slotIssue = (name: string, { allowed, spent, available }: AptitudeSlots) => {
      if (allowed === ALLOWED_ALL || available === 0) return;
      issues.push({
        category: "aptitudes",
        message:
          available > 0
            ? `${name}: ${available} unspent slot(s) (${spent}/${allowed})`
            : `${name}: overspent by ${Math.abs(available)} (${spent}/${allowed})`,
      });
    };
    const aptitudes = this.detailedCharacterAptitudes.getAptitudes();
    for (const [key, aptitude] of Object.entries(aptitudes)) {
      if (this.detailedCharacterAptitudes.isLeveledAptitude(key)) {
        const aptitudeObj = aptitude as Record<string, unknown>;
        for (let level = 0; level <= this.detailedCharacterAptitudes.maxSpellLevel; level++) {
          const levelData = aptitudeObj[String(level)] as AptitudeSlots | undefined;
          if (levelData) slotIssue(`${aptitude.name} (level ${level})`, levelData);
        }
      } else {
        slotIssue(aptitude.name, aptitude);
      }
    }

    // Check unmet requirements (skip modifier/item requirements)
    const { unmetRequirementGroups, invalidRequirements } = this.detailedCharacterRequirements.getRequirements();
    for (const group of unmetRequirementGroups) {
      if (group.every((r) => r.entityType === "modifiers")) continue;
      if (group.every((r) => r.entityType === "items")) continue;
      issues.push(this.unmetRequirementIssue(group, group.find((r) => r.entityType !== "modifiers") ?? group[0]));
    }
    for (const invalid of invalidRequirements) issues.push(this.invalidRequirementIssue(invalid));

    // Check modifier issues
    const { skippedModifiers, unappliedModifiers } = this.detailedCharacterModifiers.getModifiers();
    for (const modifier of unappliedModifiers) {
      const isConditional = unmetRequirementGroups.some((group) =>
        group.every((r) => r.entityType === "modifiers" && r.entityId === modifier.id),
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
    for (const modifier of this.modifiersPastTheirGates) {
      const source = this.resolveModifierSourceName(modifier);
      issues.push({
        category: "modifiers",
        message: `Modifier on ${modifier.target}${source ? ` from ${source.name} (${source.type})` : ""} applied while its requirement held, which no longer holds on the final sheet`,
        entityName: source?.name,
        entityType: source?.type,
      });
    }

    // Check referential integrity
    const sourceChain = (rulesetId: string, name: string, entityType: string) => {
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
    for (const klass of this.klasses) sourceChain(klass.rulesetId, klass.name, "klasses");
    for (const skill of this.skills) sourceChain(skill.rulesetId, skill.name, "skills");
    for (const feat of this.feats) sourceChain(feat.rulesetId, feat.name, "feats");
    for (const power of this.powers) sourceChain(power.rulesetId, power.name, "powers");
    for (const inv of this.inventory) sourceChain(inv.item.rulesetId, inv.item.name, "items");

    return { valid: issues.length === 0, issues };
  }

  areRequirementsMet(requirementGroups: Requirement[][]): boolean {
    if (!this.holders) return false;

    const tempRequirements = new DetailedCharacterRequirements(this.targetPaths);
    const nonEmpty = requirementGroups.filter((group) => group.length > 0);
    if (nonEmpty.length === 0) return true;

    tempRequirements.evaluateRequirements(this.holders, nonEmpty);
    const { unmetRequirementGroups, invalidRequirements } = tempRequirements.getRequirements();
    return unmetRequirementGroups.length === 0 && invalidRequirements.length === 0;
  }

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

    // Each condition evaluated as the requirements are, templates and every operator included
    const conditions = new DetailedCharacterRequirements(this.targetPaths);
    const isLeafMet = (req: Requirement) => !!this.holders && conditions.isConditionMet(req, this.holders);

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
