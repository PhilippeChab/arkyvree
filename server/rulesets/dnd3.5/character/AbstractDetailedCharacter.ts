import type { RulesetData } from "@/server/cache/rulesetCache/index.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { db, type Db } from "@/server/database/index.ts";
import { ALLOWED_ALL } from "@/server/rulesets/dnd3.5/aptitudes/AptitudesComponent.ts";
import type { Dnd35Components } from "@/server/rulesets/dnd3.5/character/components.ts";
import FeatsPaths from "@/server/rulesets/dnd3.5/feats/FeatsPaths.ts";
import PowersPaths from "@/server/rulesets/dnd3.5/powers/PowersPaths.ts";
import ModifierEvaluator from "@/server/rulesets/engine/modifiers/ModifierEvaluator.ts";
import { isTemplateValue } from "@/server/rulesets/engine/paths/templateExpression.ts";
import RequirementEvaluator from "@/server/rulesets/engine/requirements/RequirementEvaluator.ts";
import type {
  DetailedCharacterInterface,
  FeatWithPMR,
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
} from "@/server/rulesets/engine/types.ts";
import RequirementTree, { type RequirementNode } from "@/shared/customization/RequirementTree.ts";
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

  /** The character's parts, each wired to the ones it reads (`buildComponents`). */
  abstract readonly components: Dnd35Components;

  abstract readonly modifierEvaluator: ModifierEvaluator;

  abstract readonly requirementEvaluator: RequirementEvaluator;

  // Context data
  protected ruleset: Ruleset | undefined = undefined;

  protected player: Player | undefined = undefined;

  protected campaign: Campaign | undefined = undefined;

  // Ruleset data
  protected rulesetAbilities: RulesetAbility[] = [];

  protected rulesetSaves: RulesetSave[] = [];

  protected rulesetSkills: Skill[] = [];

  protected rulesetFeats: Feat[] = [];

  protected rulesetFeatProperties: Property[] = [];

  protected rulesetPowers: PowerWithAptitudes[] = [];

  protected rulesetPowerProperties: Property[] = [];

  protected rulesetAptitudes: Aptitude[] = [];

  protected rulesetKlasses: Klass[] = [];

  // Character data
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

  // Derived data
  protected klassLevelFeatCountsByAptitudeId: Record<string, number> = {};

  protected klassLevelPowerCountsByAptitudeId: Record<string, number> = {};

  protected leveledAptitudeIds: Set<string> = new Set();

  protected featListIds: Set<string> = new Set();

  // Modifier/requirement collections
  protected builtComponents: Dnd35Components | null = null;

  protected modifiers: Modifier[] = [];

  protected requirementGroups: Requirement[][] = [];

  /** The item each modifier an item is the source of belongs to, by the modifier's id. */
  private itemModifiers = new Map<string, string>();

  /** The gated modifiers applied while their requirements held, whose requirements don't hold on the final sheet. */
  private modifiersPastTheirGates: Modifier[] = [];

  protected validRulesetIds = new Set<string>();

  protected targetPaths!: TargetPathsTraverser;

  /**
   * The item a requirement group is of, whose weapon its own paths (`weapon.wielded`) read: an item's requirements, or
   * those of a modifier the item is the source of.
   */
  private itemOf = (group: Requirement[]): string | undefined => {
    const [owner] = group;
    if (owner?.entityType === "items") return owner.entityId;
    return owner?.entityType === "modifiers" ? this.itemModifiers.get(owner.entityId) : undefined;
  };

  /**
   * The sources a modifier applies from: its own, or, for an item's modifier on the item itself (a weapon's own paths)
   * behind gates, each equipped entry of the item whose gates are met there. An item held in two places is a weapon in
   * each: a bonus gated on the main hand reaches the main-hand dagger, not the off-hand one.
   */
  protected readonly sourcesOf = (modifier: Modifier): string[] => {
    if (modifier.sourceType !== "items" || !this.targetPaths.readsSource(modifier.target)) return [modifier.sourceId];
    const gates = this.requirementGroups.filter(([owner]) =>
      owner?.entityType === "modifiers" ? owner.entityId === modifier.id : owner?.entityId === modifier.sourceId,
    );
    if (gates.length === 0) return [modifier.sourceId];
    return this.inventory
      .filter(
        (entry) =>
          entry.equipped &&
          entry.item.id === modifier.sourceId &&
          this.areRequirementsMet(gates, { sourceId: entry.id }),
      )
      .map((entry) => entry.id);
  };

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
    this.featListIds = data.featListIds;
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
    this.itemModifiers = new Map(data.modifiers.filter((m) => m.sourceType === "items").map((m) => [m.id, m.sourceId]));
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
    const components = this.builtComponents!;
    const groups = this.requirementGroups.filter((group) => group.length > 0);
    const gateKey = (r: Requirement) => `${r.entityId}:${r.entityType}`;
    const keysOf = (m: Modifier) => [`${m.sourceId}:${m.sourceType}`, `${m.id}:modifiers`];
    const gateKeys = new Set(groups.flatMap((group) => group.map(gateKey)));
    const literal = modifiers.filter((m) => !isTemplateValue(m.value));

    for (const modifier of literal.filter((m) => !keysOf(m).some((key) => gateKeys.has(key)))) {
      this.modifierEvaluator.evaluateModifier(modifier, components);
    }
    let waiting = literal.filter((m) => keysOf(m).some((key) => gateKeys.has(key)));
    const appliedGated: Modifier[] = [];
    while (waiting.length > 0) {
      const waitingKeys = new Set(waiting.flatMap(keysOf));
      const round = new RequirementEvaluator(this.targetPaths);
      round.evaluateRequirements(
        components,
        groups.filter((group) => group.some((r) => waitingKeys.has(gateKey(r)))),
        this.itemOf,
      );
      const blocked = ModifierEvaluator.blockedKeys(round);
      const ready = waiting.filter((m) => !keysOf(m).some((key) => blocked.has(key)));
      if (ready.length === 0) break;
      for (const modifier of ready) this.modifierEvaluator.evaluateModifier(modifier, components);
      appliedGated.push(...ready);
      waiting = waiting.filter((m) => !ready.includes(m));
    }

    this.requirementEvaluator.evaluateRequirements(components, groups, this.itemOf);
    // A modifier can break a requirement already met, another's or its own: the modifiers it gated stay applied (undoing
    // them could loop, two modifiers breaking each other's), and validation reports them. A ready one a round skipped,
    // or that reached nothing, didn't apply
    const blockedAtTheEnd = ModifierEvaluator.blockedKeys(this.requirementEvaluator);
    const appliedIds = new Set(this.modifierEvaluator.getModifiers().appliedModifiers.map((m) => m.id));
    this.modifiersPastTheirGates = appliedGated.filter(
      (m) => appliedIds.has(m.id) && keysOf(m).some((key) => blockedAtTheEnd.has(key)),
    );
    // The modifiers still waiting are recorded as gated out; the templates apply, or are, by the final evaluation
    this.modifierEvaluator.evaluateModifiers(
      components,
      [...waiting, ...modifiers.filter((m) => isTemplateValue(m.value))],
      this.requirementEvaluator,
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
  protected abstract postModifierProcessing(rulesetData: RulesetData): Promise<void>;

  /** Ruleset-specific processing after requirements, before modifiers (e.g. proficiency penalties). */
  protected abstract postRequirementProcessing(): void;

  protected preApplyPossessionModifiers() {
    for (const mod of this.modifiers) {
      if (mod.operator !== "set" || mod.valueType !== "boolean" || mod.value !== "true") continue;

      const featSlug = FeatsPaths.parsePossessed(mod.target);
      if (featSlug !== undefined) {
        const feat = this.components.feats.getFeat(featSlug);
        if (feat && !feat.possessed) {
          feat.possessed = true;
          feat.count += 1;
        }
        continue;
      }

      const known = PowersPaths.parseKnown(mod.target);
      if (known) {
        const spell = this.components.powers.getSpellEntry(known.spell, known.list);
        if (spell && !spell.known) {
          spell.known = true;
        }
      }
    }
  }

  /** Ruleset-specific setup before requirement evaluation (e.g. spellcasting component). */
  protected abstract preRequirementProcessing(rulesetData: RulesetData): Promise<void>;

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

  /**
   * Whether the groups are met, each of the item its owner names, or of `context.sourceId` when given: a weapon's
   * proficiency, its base item's requirements, reads its own hand. A `null` source is no item: a weapon's own paths
   * (its hand) reach nothing, as for a weapon not yet held.
   */
  areRequirementsMet(requirementGroups: Requirement[][], context?: { sourceId?: string | null }): boolean {
    if (!this.builtComponents) return false;

    const tempRequirements = new RequirementEvaluator(this.targetPaths);
    const nonEmpty = requirementGroups.filter((group) => group.length > 0);
    if (nonEmpty.length === 0) return true;

    const sourceId = context?.sourceId;
    tempRequirements.evaluateRequirements(
      this.builtComponents,
      nonEmpty,
      sourceId === undefined ? this.itemOf : () => sourceId ?? undefined,
    );
    const { unmetRequirementGroups, invalidRequirements } = tempRequirements.getRequirements();
    return unmetRequirementGroups.length === 0 && invalidRequirements.length === 0;
  }

  formatRequirements(requirements: Requirement[]): string {
    // A row under a condition, which groups nothing, isn't printed
    const { roots } = RequirementTree.fromRows(requirements);

    // Each condition evaluated as the requirements are, templates and every operator included
    const conditions = new RequirementEvaluator(this.targetPaths);
    const isLeafMet = (req: Requirement) =>
      !!this.builtComponents && conditions.isConditionMet(req, this.builtComponents, this.itemOf([req]));

    const formatNode = (node: RequirementNode<Requirement>, indent: string): string => {
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

  getCampaign() {
    return this.campaign;
  }

  getPlayer() {
    return this.player;
  }

  getRuleset() {
    return this.ruleset;
  }

  abstract getSpellcasting(): { arcane: number; divine: number };

  abstract getSpellTags(): Record<string, string[]>;

  getUnmetRequirementIssues(requirementGroups: Requirement[][]): RequirementIssue[] {
    if (!this.builtComponents) return [];

    const tempRequirements = new RequirementEvaluator(this.targetPaths);
    const nonEmpty = requirementGroups.filter((group) => group.length > 0);
    if (nonEmpty.length === 0) return [];

    tempRequirements.evaluateRequirements(this.builtComponents, nonEmpty, this.itemOf);
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
    const aptitudes = this.components.aptitudes.getAptitudes();
    for (const [key, aptitude] of Object.entries(aptitudes)) {
      if (this.components.aptitudes.isLeveledAptitude(key)) {
        const aptitudeObj = aptitude as Record<string, unknown>;
        for (let level = 0; level <= this.components.aptitudes.maxSpellLevel; level++) {
          const levelData = aptitudeObj[String(level)] as AptitudeSlots | undefined;
          if (levelData) slotIssue(`${aptitude.name} (level ${level})`, levelData);
        }
      } else {
        slotIssue(aptitude.name, aptitude);
      }
    }

    // Check unmet requirements (skip modifier/item requirements)
    const { unmetRequirementGroups, invalidRequirements } = this.requirementEvaluator.getRequirements();
    for (const group of unmetRequirementGroups) {
      if (group.every((r) => r.entityType === "modifiers")) continue;
      if (group.every((r) => r.entityType === "items")) continue;
      issues.push(this.unmetRequirementIssue(group, group.find((r) => r.entityType !== "modifiers") ?? group[0]));
    }
    for (const invalid of invalidRequirements) issues.push(this.invalidRequirementIssue(invalid));

    // Check modifier issues
    const { skippedModifiers, unappliedModifiers } = this.modifierEvaluator.getModifiers();
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

      // 4. Build components (subclass — includes ruleset-specific components)
      this.builtComponents = this.components;

      // 5. Pre-requirement processing (subclass — e.g. the spellcasting component, a bonded creature's stat block)
      await this.preRequirementProcessing(rulesetData);

      // 6. Post-requirement processing (subclass — e.g. proficiency penalties, which check requirements of their own)
      this.postRequirementProcessing();

      // 7. Non-power modifiers, and the requirements that gate them (universal)
      const powerModifiers = this.modifiers.filter((m) => PowersPaths.isPowerTarget(m.target));
      const otherModifiers = this.modifiers.filter((m) => !PowersPaths.isPowerTarget(m.target));
      this.applyModifiersInRounds(otherModifiers);

      // 8. Ruleset-specific post-modifier processing (subclass)
      await this.postModifierProcessing(rulesetData);

      // 9. Evaluate power modifiers (universal)
      this.modifierEvaluator.evaluateModifiers(this.builtComponents, powerModifiers, this.requirementEvaluator);
    });
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
}
