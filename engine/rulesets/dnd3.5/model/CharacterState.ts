import type ModifierEvaluator from "@/engine/core/modifiers/ModifierEvaluator.ts";
import { type CharacterRows } from "@/engine/core/module/index.ts";
import type { TargetPathsTraverser } from "@/engine/core/paths/CategoryPaths.ts";
import RequirementEvaluator from "@/engine/core/requirements/RequirementEvaluator.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import { type SkillFieldValues } from "@/engine/rulesets/dnd3.5/entities/skills/SkillFields.ts";
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

import { type Dnd35Components } from "./CharacterComponents.ts";
import type {
  CustomizedClassLevel,
  CustomizedFeat,
  CustomizedPower,
  CustomizedRace,
  InventoryEntry,
} from "./loading/CustomizedEntities.ts";
import type { LoadedCharacterData, SkillWithRank } from "./loading/DetailedCharacterDataLoader.ts";
import type { ProjectedCharacterData } from "./projection.ts";

/** What assembles a character's data from its rows and its ruleset's view: reading nothing. */
export interface DataLoader {
  load(rows: CharacterRows, view: RulesetView, projectedData?: ProjectedCharacterData): LoadedCharacterData;
}

/**
 * A 3.5 character's state: what its build loads and computes, and the components it's made of. Its concerns add the
 * build (`Builds`), the validation (`Validates`) and the spells and feats it has without a pick
 * (`PossessesVirtually`); `DetailedCharacter` wires them.
 */
export default abstract class CharacterState {
  constructor(protected readonly character: Character) {}

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

  /** The character's parts, each wired to the ones it reads (`CharacterComponents.build`). */
  abstract readonly components: Dnd35Components;

  abstract readonly modifierEvaluator: ModifierEvaluator;

  abstract readonly requirementEvaluator: RequirementEvaluator;

  // Modifier/requirement collections
  protected builtComponents: Dnd35Components | null = null;

  protected campaign: Campaign | undefined = undefined;

  protected characterAbilityScores: { abilityId: string; name: string; score: number }[] = [];

  protected characterLevels: CharacterLevel[] = [];

  // Diagnostic helpers (resolveEntityName / resolveModifierSourceName) run
  // per unmet-requirement when formatting validation errors. Build lookup
  // maps once on first use and reuse across subsequent resolve calls.
  // The index is cached for the lifetime of the DetailedCharacter instance;
  // it relies on `feats` / `powers` / `inventory` / `klassLevels` / `race`
  // / `rulesetKlasses` being immutable after `build()` returns. If any
  // future code mutates those post-build, invalidate this field first.
  protected diagnosticsIndex?: {
    featsById: Map<string, CustomizedFeat>;
    inventoryByItemId: Map<string, InventoryEntry>;
    klassLevelsById: Map<string, CustomizedClassLevel>;
    modifierOwner: Map<string, { name: string; type: string }>;
    powersById: Map<string, CustomizedPower>;
    rulesetKlassesById: Map<string, Klass>;
  };

  protected featListIds: Set<string> = new Set();

  protected feats: CustomizedFeat[] = [];

  protected inventory: InventoryEntry[] = [];

  /** The item each modifier an item is the source of belongs to, by the modifier's id. */
  protected itemModifiers = new Map<string, string>();

  /**
   * The item a requirement group is of, whose weapon its own paths (`weapon.wielded`) read: an item's requirements, or
   * those of a modifier the item is the source of.
   */
  protected itemOf = (group: Requirement[]): string | undefined => {
    const [owner] = group;
    if (owner?.entityType === "items") return owner.entityId;
    return owner?.entityType === "modifiers" ? this.itemModifiers.get(owner.entityId) : undefined;
  };

  protected klassBonusSpellAbilityMap = new Map<string, string>();

  protected klassCasterTypeMap = new Map<string, "Arcane" | "Divine">();

  protected klasses: Klass[] = [];

  // Derived data
  protected klassLevelFeatCountsByAptitudeId: Record<string, number> = {};

  protected klassLevelPowerCountsByAptitudeId: Record<string, number> = {};

  protected klassLevelProperties: Map<string, { bab: number; skills: number }> = new Map();

  protected klassLevels: CustomizedClassLevel[] = [];

  protected klassLevelSaves: KlassLevelSave[] = [];

  protected klassSkills: KlassSkill[] = [];

  protected languages: Language[] = [];

  protected leveledAptitudeIds: Set<string> = new Set();

  protected modifiers: Modifier[] = [];

  /** The gated modifiers applied while their requirements held, whose requirements don't hold on the final sheet. */
  protected modifiersPastTheirGates: Modifier[] = [];

  protected player: Player | undefined = undefined;

  protected powers: CustomizedPower[] = [];

  // Character data
  protected race: CustomizedRace = {} as CustomizedRace;

  protected requirementGroups: Requirement[][] = [];

  // Context data
  protected ruleset: Ruleset | undefined = undefined;

  // Ruleset data
  protected rulesetAbilities: RulesetAbility[] = [];

  protected rulesetAptitudes: Aptitude[] = [];

  protected rulesetFeatProperties: Property[] = [];

  protected rulesetFeats: Feat[] = [];

  protected rulesetKlasses: Klass[] = [];

  protected rulesetPowerProperties: Property[] = [];

  protected rulesetPowers: PowerWithAptitudes[] = [];

  protected rulesetSaves: RulesetSave[] = [];

  protected rulesetSkills: Skill[] = [];

  // Dnd3.5-specific data
  protected skillFields: Map<string, SkillFieldValues> = new Map();

  protected skillPointAbilityId: string | null = null;

  protected skills: SkillWithRank[] = [];

  protected targetPaths!: TargetPathsTraverser;

  protected validRulesetIds = new Set<string>();

  /** Create the data loader for this ruleset. */
  protected abstract createDataLoader(): DataLoader;

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

  getCampaign() {
    return this.campaign;
  }

  /** The feats the character holds that don't stack: picked, granted, planned or from its modifiers. */
  getHeldNonStackableFeatIds() {
    return this.feats.filter((feat) => !feat.stackable).map((feat) => feat.id);
  }

  /** The powers the character knows in a pool: picked, granted, planned or from its modifiers. */
  getKnownPowerIds(aptitudeId: string) {
    return this.powers.filter((power) => power.aptitudeId === aptitudeId).map((power) => power.id);
  }

  getPlayer() {
    return this.player;
  }

  getRuleset() {
    return this.ruleset;
  }
}
