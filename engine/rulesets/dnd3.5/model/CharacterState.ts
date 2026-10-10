import type ModifierEvaluator from "@/engine/core/modifiers/ModifierEvaluator.ts";
import { type CharacterRows } from "@/engine/core/module/index.ts";
import type { TargetPathsTraverser } from "@/engine/core/paths/CategoryPaths.ts";
import RequirementEvaluator from "@/engine/core/requirements/RequirementEvaluator.ts";
import type { RulesetData, RulesetView } from "@/engine/core/view/index.ts";
import type { Character, Klass, Modifier, Requirement } from "@/shared/relations.ts";

import { type Dnd35Components } from "./CharacterComponents.ts";
import type {
  CustomizedClassLevel,
  CustomizedFeat,
  CustomizedPower,
  InventoryEntry,
} from "./loading/CustomizedEntities.ts";
import type { LoadedCharacterData } from "./loading/DetailedCharacterDataLoader.ts";

/** What assembles a character's data from its rows and its ruleset's view: reading nothing. */
export interface DataLoader {
  load(rows: CharacterRows, view: RulesetView): LoadedCharacterData;
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
    const gates = this.data.requirementGroups.filter(([owner]) =>
      owner?.entityType === "modifiers" ? owner.entityId === modifier.id : owner?.entityId === modifier.sourceId,
    );
    if (gates.length === 0) return [modifier.sourceId];
    return this.data.inventory
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

  /** What the build loaded of the character's rows and the view (`DataLoader`), and what it adds (a creature's feats). */
  protected data!: LoadedCharacterData;

  // Diagnostic helpers (resolveEntityName / resolveModifierSourceName) run
  // per unmet-requirement when formatting validation errors. Build lookup
  // maps once on first use and reuse across subsequent resolve calls.
  // The index is cached for the lifetime of the DetailedCharacter instance;
  // it relies on the loaded feats, powers, inventory, class levels and race
  // being immutable after `build()` returns. If any
  // future code mutates those post-build, invalidate this field first.
  protected diagnosticsIndex?: {
    featsById: Map<string, CustomizedFeat>;
    inventoryByItemId: Map<string, InventoryEntry>;
    klassLevelsById: Map<string, CustomizedClassLevel>;
    modifierOwner: Map<string, { name: string; type: string }>;
    powersById: Map<string, CustomizedPower>;
    rulesetKlassesById: Map<string, Klass>;
  };

  /**
   * The item a requirement group is of, whose weapon its own paths (`weapon.wielded`) read: an item's requirements, or
   * those of a modifier the item is the source of.
   */
  protected itemOf = (group: Requirement[]): string | undefined => {
    const [owner] = group;
    if (owner?.entityType === "items") return owner.entityId;
    return owner?.entityType === "modifiers" ? this.data.itemModifiers.get(owner.entityId) : undefined;
  };

  /** The gated modifiers applied while their requirements held, whose requirements don't hold on the final sheet. */
  protected modifiersPastTheirGates: Modifier[] = [];

  protected targetPaths!: TargetPathsTraverser;

  /** The ruleset's view the character is built in: the ruleset, and its lists the build reads. */
  protected view!: RulesetView;

  /** Create the data loader for this ruleset. */
  protected abstract createDataLoader(): DataLoader;

  /**
   * The groups (those that require anything) evaluated on the built sheet, apart from the build's own evaluation, each
   * of the item its owner names, or of `context.sourceId` when given: nothing evaluated before the build.
   */
  protected evaluateGroups(requirementGroups: Requirement[][], context?: { sourceId?: string | null }) {
    const evaluator = new RequirementEvaluator(this.targetPaths);
    const nonEmpty = requirementGroups.filter((group) => group.length > 0);
    if (!this.builtComponents || nonEmpty.length === 0) return evaluator.getRequirements();
    const sourceId = context?.sourceId;
    const itemOf = sourceId === undefined ? this.itemOf : () => sourceId ?? undefined;
    evaluator.evaluateRequirements(this.builtComponents, nonEmpty, itemOf);
    return evaluator.getRequirements();
  }

  /** The ruleset's lists and indices, as its view composes them. */
  protected get rulesetData(): RulesetData {
    return this.view.rulesetData;
  }

  /**
   * Whether the groups are met, each of the item its owner names, or of `context.sourceId` when given: a weapon's
   * proficiency, its base item's requirements, reads its own hand. A `null` source is no item: a weapon's own paths
   * (its hand) reach nothing, as for a weapon not yet held.
   */
  areRequirementsMet(requirementGroups: Requirement[][], context?: { sourceId?: string | null }): boolean {
    if (!this.builtComponents) return false;
    const { unmetRequirementGroups, invalidRequirements } = this.evaluateGroups(requirementGroups, context);
    return unmetRequirementGroups.length === 0 && invalidRequirements.length === 0;
  }

  getCampaign() {
    return this.data.campaign;
  }

  /** The feats the character holds, with their customizations: picked, granted, planned or from its modifiers. */
  getHeldFeats() {
    return this.data.feats;
  }

  /** The powers the character knows, each in its pool: picked, granted, planned or from its modifiers (`virtual`). */
  getHeldPowers() {
    return this.data.powers;
  }

  getPlayer() {
    return this.data.player;
  }

  getRuleset() {
    return this.view.ruleset;
  }
}
