import ModifierEvaluator from "@/engine/core/modifiers/ModifierEvaluator.ts";
import type { CharacterRows } from "@/engine/core/module/index.ts";
import type { TargetPathsTraverser } from "@/engine/core/paths/CategoryPaths.ts";
import RequirementEvaluator from "@/engine/core/requirements/RequirementEvaluator.ts";
import type { RulesIssue } from "@/engine/core/RulesError.ts";
import type { RulesetData, RulesetView } from "@/engine/core/view/index.ts";
import { isTemplateValue } from "@/shared/customization/templateExpression.ts";
import type { Character, Modifier, Requirement } from "@/shared/relations.ts";

import type { BuiltCharacter, default as CharacterComponent } from "./CharacterComponent.ts";
import type { default as CharacterDataLoader, LoadedCharacter } from "./CharacterDataLoader.ts";

/** A row of the ruleset's entities the character has, which its source chain must hold: its name and its ruleset. */
interface EntityRow {
  name: string;
  rulesetId: string;
}

/**
 * A character, as every ruleset builds it (`build`): its data loaded (`createDataLoader`), its components (`C`, each a
 * `CharacterComponent`) set up in the order its ruleset lists them, its modifiers applied in rounds behind their
 * requirements, its components finished, then the modifiers the ruleset applies last (`isLateModifier`); and what its
 * validation reads (`Validates`): the ruleset's own issues, the rows it has from outside its source chain
 * (`findSourceIssues`) and the names its issues give (`resolveEntityName`). A ruleset's character extends it and
 * implements each step its rules take.
 */
export default abstract class CharacterBase<
  C extends { [K in keyof C]: CharacterComponent<D> },
  D extends LoadedCharacter,
> implements BuiltCharacter {
  /** A character of `character`'s row, its paths walked by its ruleset's (`targetPaths`), which its evaluators read. */
  constructor(
    protected readonly character: Character,
    protected readonly targetPaths: TargetPathsTraverser,
  ) {
    this.modifierEvaluator = new ModifierEvaluator(targetPaths, this.sourcesOf);
    this.requirementEvaluator = new RequirementEvaluator(targetPaths);
  }

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

  /**
   * The character's parts, each built with the ones it reads, by the key its target paths reach it by: the order they're
   * listed in is the order the build sets them up in.
   */
  abstract readonly components: C;

  readonly modifierEvaluator: ModifierEvaluator;

  readonly requirementEvaluator: RequirementEvaluator;

  /** The names of the character's items, by their id and by the id of the item a copy is of: built on first read. */
  private itemNames?: Map<string, string>;

  /** The components the evaluators walk, once the build set them up. */
  protected builtComponents: C | null = null;

  /** What the build loaded of the character's rows and the view (`CharacterDataLoader`), and what it adds. */
  protected data!: D;

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

  /** The ruleset's view the character is built in: the ruleset, and its lists the build reads. */
  protected view!: RulesetView;

  /** The ruleset's data loader, which assembles the character's data from its rows and the view. */
  protected abstract createDataLoader(): CharacterDataLoader<D>;

  /** The ruleset's issues about what the character has, before its requirements' and modifiers' (`validate`). */
  protected abstract findRulesetIssues(): RulesIssue[];

  /** Whether a modifier applies after the components' finish (`CharacterComponent.finalize`), not in the rounds. */
  protected abstract isLateModifier(modifier: Modifier): boolean;

  /**
   * The rows the character has of its ruleset's entities (its race, its classes…), by table, in the order its issues
   * list them: each from a ruleset of its source chain (`findSourceIssues`), as its items are.
   */
  protected abstract listEntityRows(): Record<string, readonly EntityRow[]>;

  /**
   * The name of one of its ruleset's entities an issue is about, as the character has it (a feat, a class level), past
   * what the base names (`resolveEntityName`): none when it has no such entity.
   */
  protected abstract nameEntity(entityId: string, entityType: string): string | undefined;

  /**
   * The ruleset's steps once the components are set up, before the modifiers apply and the requirements read the
   * sheet: what its rules set on the sheet first.
   */
  protected abstract prepareSheet(): void;

  /** The entity a modifier comes from, by its name and its type: none when the character has no such source. */
  abstract resolveModifierSourceName(modifier: Modifier): { name: string; type: string } | undefined;

  /**
   * Applies the modifiers in rounds, so a modifier's requirements read the sheet the other modifiers have already
   * changed (an item's Strength counts toward a feat's prerequisite): first those no requirement gates, then, round
   * after round, the gated ones whose requirements the sheet now meets, until a round applies none. Each round checks
   * only the requirements gating a modifier still waiting. A template modifier, which reads the sheet, applies last.
   * The requirements are evaluated once more on the final sheet: the evaluation the templates, the late modifiers and
   * the validation read.
   */
  private applyModifiersInRounds(modifiers: Modifier[]): void {
    const components = this.builtComponents!;
    const groups = this.data.requirementGroups.filter((group) => group.length > 0);
    const gateKey = (r: Requirement) => `${r.entityId}:${r.entityType}`;
    const keysOf = (m: Modifier) => [`${m.sourceId}:${m.sourceType}`, `${m.id}:modifiers`];
    const gateKeys = new Set(groups.flatMap((group) => group.map(gateKey)));
    const literal = modifiers.filter((m) => !isTemplateValue(m.value));

    for (const modifier of literal.filter((m) => !keysOf(m).some((key) => gateKeys.has(key))))
      this.modifierEvaluator.evaluateModifier(modifier, components);

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
      const blocked = round.getBlockedKeys();
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
    const blockedAtTheEnd = this.requirementEvaluator.getBlockedKeys();
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

  /** The names of the character's items, by their id and by the id of the item a copy is of. */
  private namesOfItems(): Map<string, string> {
    if (this.itemNames) return this.itemNames;
    this.itemNames = new Map();
    for (const { item } of this.data.inventory) {
      this.itemNames.set(item.id, item.name);
      if (item.sourceItemId) this.itemNames.set(item.sourceItemId, item.name);
    }
    return this.itemNames;
  }

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

  /**
   * The issues of the rows the character has from outside its source chain (`validRulesetIds`): its ruleset's entities'
   * (`listEntityRows`), then its items'. A ruleset that has issues of its own about them puts them first.
   */
  protected findSourceIssues(): RulesIssue[] {
    const rows = { ...this.listEntityRows(), items: this.data.inventory.map(({ item }) => item) };
    return Object.entries(rows).flatMap(([entityType, entities]) =>
      entities
        .filter(({ rulesetId }) => !this.data.validRulesetIds.has(rulesetId))
        .map(({ name }) => ({
          category: "integrity",
          message: `${entityType} "${name}" belongs to a ruleset not in this character's source chain`,
          entityName: name,
          entityType,
        })),
    );
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

  /**
   * Builds the character from its rows (`rows`) in its ruleset's `view`: it reads nothing. A creature bonded to a
   * master is given its `master` built; a character of its own needs none.
   */
  build(rows: CharacterRows, view: RulesetView, _master?: CharacterBase<C, D>) {
    // 1. Assemble the data from the rows and the view
    this.view = view;
    this.data = this.createDataLoader().load(rows, view);

    // 2. Each component set up from the loaded data, in the order the ruleset lists them
    for (const component of Object.values<CharacterComponent<D>>(this.components))
      component.initialize(this.data, view);

    // 3. The components the evaluators walk
    this.builtComponents = this.components;

    // 4. The ruleset's steps before the requirements read the sheet
    this.prepareSheet();

    // 5. The modifiers but the late ones, and the requirements that gate them
    const lateModifiers = this.data.modifiers.filter((m) => this.isLateModifier(m));
    this.applyModifiersInRounds(this.data.modifiers.filter((m) => !this.isLateModifier(m)));

    // 6. Each component finished, from what the modifiers left
    for (const component of Object.values<CharacterComponent<D>>(this.components))
      component.finalize(this.data, view, this);

    // 7. The late modifiers, gated by the final requirement evaluation
    this.modifierEvaluator.evaluateModifiers(this.builtComponents, lateModifiers, this.requirementEvaluator);
  }

  getCampaign() {
    return this.data.campaign;
  }

  getPlayer() {
    return this.data.player;
  }

  getRuleset() {
    return this.view.ruleset;
  }

  /**
   * The name of the entity an issue is about, as the character has it: itself, one of its items (or the item a copy of
   * one is of), a modifier's source, or one of its ruleset's entities (`nameEntity`); none when it has no such entity.
   */
  resolveEntityName(entityId: string, entityType: string): string | undefined {
    if (entityType === "characters") return this.character.id === entityId ? this.character.name : undefined;
    if (entityType === "items") return this.namesOfItems().get(entityId);
    const modifier = entityType === "modifiers" ? this.data.modifiers.find((m) => m.id === entityId) : undefined;
    if (modifier) return this.resolveEntityName(modifier.sourceId, modifier.sourceType);
    return this.nameEntity(entityId, entityType);
  }
}
