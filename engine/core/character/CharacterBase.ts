import ModifierEvaluator from "@/engine/core/modifiers/ModifierEvaluator.ts";
import type { CharacterRows } from "@/engine/core/module/index.ts";
import type { TargetPathsTraverser } from "@/engine/core/paths/CategoryPaths.ts";
import type { PathContext } from "@/engine/core/paths/PathCategory.ts";
import RequirementEvaluator from "@/engine/core/requirements/RequirementEvaluator.ts";
import type { RulesIssue } from "@/engine/core/RulesError.ts";
import type { RulesetData, RulesetView } from "@/engine/core/view/index.ts";
import { isTemplateValue } from "@/shared/customization/templateExpression.ts";
import type { Character, Modifier, Requirement } from "@/shared/relations.ts";

import type { BuiltCharacter, default as CharacterComponent, RequirementsContext } from "./CharacterComponent.ts";
import type { default as CharacterDataLoader, LoadedCharacter } from "./CharacterDataLoader.ts";

/** A row of the ruleset's entities the character has, which its source chain must hold: its name and its ruleset. */
interface EntityRow {
  name: string;
  rulesetId: string;
}

/**
 * Where the rounds are in a build's modifiers (`data.modifiers`, which grants add to): how many they met, the gated
 * literals waiting for their requirements, and the keys of the requirement groups met so far (how many), which gate a
 * modifier of that key.
 */
interface Rounds {
  gateKeys: Set<string>;
  groupsMet: number;
  met: number;
  waiting: Modifier[];
}

/** The key a requirement gates by: its entity's, a modifier's own or its source's (`keysOf`). */
function gateKeyOf(requirement: Requirement) {
  return `${requirement.entityId}:${requirement.entityType}`;
}

/** The keys a modifier is gated by: its source's (a feat's prerequisites, an item's own) and its own requirements'. */
function keysOf(modifier: Modifier) {
  return [`${modifier.sourceId}:${modifier.sourceType}`, `${modifier.id}:modifiers`];
}

/**
 * A character, as every ruleset builds it (`build`): its data loaded (`createDataLoader`), its components (`C`, each a
 * `CharacterComponent`) set up in the order its ruleset lists them, its modifiers applied in rounds behind their
 * requirements, what a grant gives joining them as it applies (`grantsOf`) and the sheet settled before each round and
 * after it (`settleSheet`), its components finished, then the modifiers the ruleset applies last (`isLateModifier`);
 * and what its validation reads (`Validates`): the ruleset's own issues, the rows it has from outside its source chain
 * (`findSourceIssues`) and the names its issues give (`resolveEntityName`). A ruleset's character extends it and
 * implements each step its rules take.
 */
export default abstract class CharacterBase<
  C extends { [K in keyof C]: CharacterComponent<D> },
  D extends LoadedCharacter,
> implements BuiltCharacter {
  /**
   * A character of `character`'s row, its paths walked by its ruleset's (`targetPaths`), which its evaluators read. A
   * modifier gives what it grants as it applies, whichever step applies it (`grantsOf`, its modifiers joining the
   * build).
   */
  constructor(
    protected readonly character: Character,
    protected readonly targetPaths: TargetPathsTraverser,
  ) {
    this.modifierEvaluator = new ModifierEvaluator(targetPaths, this.contextsOf, (modifier) =>
      this.joinModifiers(this.grantsOf(modifier)),
    );
    this.requirementEvaluator = new RequirementEvaluator(targetPaths);
  }

  /**
   * The contexts a modifier applies in: each scope of the sheet it takes on its own (`scopesOf`) that meets its own
   * requirements whole, as their evaluation reads them (`groupContextsOf`: its source's are read on the sheet); for an
   * item's modifier on the item itself (a weapon's own paths) behind gates, each equipped entry of the item whose gates
   * are met there (an item held in two places is a weapon in each: a bonus gated on the main hand reaches the main-hand
   * dagger, not the off-hand one); else its own source, on the whole sheet.
   */
  protected readonly contextsOf = (modifier: Modifier): PathContext[] => {
    const scopes = this.modifierScopes.get(modifier.id);
    if (scopes) {
      const gates = this.ownGatesOf(modifier);
      const met = scopes.filter((scope) => this.areRequirementsMet(gates, { scope }));
      return met.map((scope) => ({ scope, sourceId: modifier.sourceId }));
    }
    if (!this.rulesetData.isInventoryType(modifier.sourceType) || !this.targetPaths.readsSource(modifier.target))
      return [{ sourceId: modifier.sourceId }];
    const gates = this.gatesOf(modifier);
    if (gates.length === 0) return [{ sourceId: modifier.sourceId }];
    return this.data.inventory
      .filter(
        (entry) =>
          entry.location !== null &&
          entry.item.id === modifier.sourceId &&
          this.areRequirementsMet(gates, { sourceId: entry.id }),
      )
      .map((entry) => ({ sourceId: entry.id }));
  };

  /**
   * The scopes of the sheet each modifier that applies per scope applies in (`scopesOf`), by the modifier's id: read
   * once the sheet is prepared, as the rounds meet the modifier.
   */
  protected readonly modifierScopes = new Map<string, string[]>();

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
   * What a requirement group is read for: the item it's of, whose weapon its own paths (`weapon.wielded`) read (an
   * item's requirements, or those of a modifier the item is the source of), and, for a modifier's own requirements
   * when the modifier applies per scope (`scopesOf`), each of its scopes, the group met when one of them meets it whole.
   */
  protected groupContextsOf = (group: Requirement[]): PathContext[] => {
    const [owner] = group;
    if (owner && this.rulesetData.isInventoryType(owner.entityType)) return [{ sourceId: owner.entityId }];
    if (owner?.entityType !== "modifiers") return [{}];
    const sourceId = this.data.itemModifiers.get(owner.entityId);
    const scopes = this.modifierScopes.get(owner.entityId) ?? [];
    return scopes.length > 0 ? scopes.map((scope) => ({ scope, sourceId })) : [{ sourceId }];
  };

  /** The gated modifiers applied while their requirements held, whose requirements don't hold on the final sheet. */
  protected modifiersPastTheirGates: Modifier[] = [];

  /** The ruleset's view the character is built in: the ruleset, and its lists the build reads. */
  protected view!: RulesetView;

  /** The ruleset's data loader, which assembles the character's data from its rows and the view. */
  protected abstract createDataLoader(): CharacterDataLoader<D>;

  /** The ruleset's issues about what the character has, before its requirements' and modifiers' (`validate`). */
  protected abstract findRulesetIssues(): RulesIssue[];

  /**
   * What a modifier gives the character past its target once it applied (a ruleset's grants: 3.5's feat a modifier
   * makes possessed, which it then has, counted and listed): the modifiers of what it grants, which join the build
   * (`joinModifiers`) and apply in its rounds behind their own requirements. None for any other modifier.
   */
  protected abstract grantsOf(modifier: Modifier): Modifier[];

  /** Whether a modifier applies after the components' finish (`CharacterComponent.finalize`), not in the rounds. */
  protected abstract isLateModifier(modifier: Modifier): boolean;

  /**
   * The rows the character has of its ruleset's entities (its race, its classes…), by type, in the order its issues
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

  /**
   * The scopes of the sheet a modifier applies in, each on its own (a ruleset's: 3.5's weapon sets, for a modifier on
   * an armor class), its own requirements read and its target reached in each (`contextsOf`); null for one the whole
   * sheet takes.
   */
  protected abstract scopesOf(modifier: Modifier): string[] | null;

  /**
   * The ruleset's steps that read what the modifiers gave the character (3.5's weapon rules, by the feats it has), run
   * once the modifiers no requirement gates have applied and after each round, so every round and the final check read
   * the sheet as the modifiers left it: each run sets what it settles as the sheet stands, whatever an earlier run set.
   */
  protected abstract settleSheet(): void;

  /** The entity a modifier comes from, by its name and its type: none when the character has no such source. */
  abstract resolveModifierSourceName(modifier: Modifier): { name: string; type: string } | undefined;

  /**
   * Applies the modifiers in rounds, so a modifier's requirements read the sheet the other modifiers have already
   * changed (an item's Strength counts toward a feat's prerequisite): first those no requirement gates, then, round
   * after round, the gated ones whose requirements the sheet now meets, until a round applies none. A modifier that
   * grants (`grantsOf`: 3.5's feat it makes possessed) gives what it grants as it applies, behind its requirements as
   * any modifier, and what it grants's modifiers join the rounds, so a grant's requirements read what other grants
   * gave. The ruleset's steps that read what the modifiers gave (`settleSheet`: 3.5's Weapon Finesse and weapon
   * proficiency) settle the sheet before the first round and after each, so a round reads what the ones before it
   * gave. Each round checks only the requirements gating a modifier still waiting. Then the requirements are evaluated
   * once more on the sheet the last round read: the evaluation the templates, which read the sheet and apply last, the
   * late modifiers and the validation read, which meets none of the modifiers still waiting, so what applies after the
   * rounds grants nothing: a grant written as a template, which would apply then, is skipped (`findGrantError`).
   */
  private applyModifiersInRounds(): void {
    const components = this.builtComponents!;
    const rounds: Rounds = { gateKeys: new Set(), groupsMet: 0, met: 0, waiting: [] };
    this.meetModifiers(rounds);
    this.settleSheet();
    const appliedGated: Modifier[] = [];
    while (rounds.waiting.length > 0) {
      const ready = this.findReady(rounds.waiting);
      if (ready.length === 0) break;
      rounds.waiting = rounds.waiting.filter((m) => !ready.includes(m));
      for (const modifier of ready) this.modifierEvaluator.evaluateModifier(modifier, components);
      appliedGated.push(...ready);
      // What the ready ones granted: its modifiers apply, or wait, in turn
      this.meetModifiers(rounds);
      // What the round gave settles the sheet the next round, or the final evaluation, reads
      this.settleSheet();
    }

    this.requirementEvaluator.evaluateRequirements(components, this.findGatingGroups(), this.groupContextsOf);
    // A modifier can break a requirement already met, another's or its own: the modifiers it gated stay applied, and
    // what they granted stays given (undoing them could loop, two modifiers breaking each other's), and validation
    // reports them. A ready one a round skipped, or that reached nothing, didn't apply
    const blockedAtTheEnd = this.requirementEvaluator.getBlockedKeys();
    const appliedIds = new Set(this.modifierEvaluator.getModifiers().appliedModifiers.map((m) => m.id));
    this.modifiersPastTheirGates = appliedGated.filter(
      (m) => appliedIds.has(m.id) && keysOf(m).some((key) => blockedAtTheEnd.has(key)),
    );
    // The modifiers still waiting are recorded as gated out, the last round having read this sheet; the templates (none
    // a grant: one on a grant's path is skipped, a grant setting a literal true) apply, or are, by the final evaluation
    const templates = this.data.modifiers.filter((m) => isTemplateValue(m.value) && !this.isLateModifier(m));
    this.modifierEvaluator.evaluateModifiers(components, [...rounds.waiting, ...templates], this.requirementEvaluator);
  }

  /** The requirement groups that require anything: what gates a modifier or an item. */
  private findGatingGroups(): Requirement[][] {
    return this.data.requirementGroups.filter((group) => group.length > 0);
  }

  /**
   * The gated modifiers (`waiting`) whose requirements the sheet now meets: of the groups, only those gating one of them
   * are read.
   */
  private findReady(waiting: Modifier[]): Modifier[] {
    const waitingKeys = new Set(waiting.flatMap(keysOf));
    const round = new RequirementEvaluator(this.targetPaths);
    round.evaluateRequirements(
      this.builtComponents!,
      this.findGatingGroups().filter((group) => group.some((r) => waitingKeys.has(gateKeyOf(r)))),
      this.groupContextsOf,
    );
    const blocked = round.getBlockedKeys();
    return waiting.filter((m) => !keysOf(m).some((key) => blocked.has(key)));
  }

  /**
   * Meets the build's modifiers the rounds haven't met (`rounds.met` of `data.modifiers`, which grants add to), in their
   * order: each one's scopes read (`scopesOf`), a late one and a template left for their steps, a literal no requirement
   * gates applied at once, a gated one waiting (`rounds.waiting`). What an applied one grants joins the build, and is
   * met in turn.
   */
  private meetModifiers(rounds: Rounds): void {
    const { modifiers, requirementGroups } = this.data;
    while (rounds.met < modifiers.length) {
      for (; rounds.groupsMet < requirementGroups.length; rounds.groupsMet++)
        for (const requirement of requirementGroups[rounds.groupsMet]) rounds.gateKeys.add(gateKeyOf(requirement));
      const modifier = modifiers[rounds.met++];
      const scopes = this.scopesOf(modifier);
      if (scopes) this.modifierScopes.set(modifier.id, scopes);
      if (this.isLateModifier(modifier) || isTemplateValue(modifier.value)) continue;
      if (keysOf(modifier).some((key) => rounds.gateKeys.has(key))) rounds.waiting.push(modifier);
      else this.modifierEvaluator.evaluateModifier(modifier, this.builtComponents!);
    }
  }

  /** The names of the character's items, by their id and by the id of the item a copy is of. */
  private namesOfItems(): Map<string, string> {
    if (this.itemNames) return this.itemNames;
    this.itemNames = new Map();
    for (const { item } of this.data.inventory) {
      this.itemNames.set(item.id, item.name);
      const templateId = this.rulesetData.inheritedFrom(item.type, item);
      if (templateId) this.itemNames.set(templateId, item.name);
    }
    return this.itemNames;
  }

  /**
   * The groups (those that require anything) evaluated on the built sheet, apart from the build's own evaluation, each
   * in its own contexts (`groupContextsOf`), what `context` gives taking their place: a scope asked for reads each
   * group there alone. Nothing evaluated before the build.
   */
  protected evaluateGroups(requirementGroups: Requirement[][], context: RequirementsContext = {}) {
    const evaluator = new RequirementEvaluator(this.targetPaths);
    const nonEmpty = requirementGroups.filter((group) => group.length > 0);
    if (!this.builtComponents || nonEmpty.length === 0) return evaluator.getRequirements();
    const { scope, sourceId } = context;
    const read = (own: PathContext): PathContext => ({
      scope: scope ?? own.scope,
      sourceId: sourceId === undefined ? own.sourceId : (sourceId ?? undefined),
    });
    const contextsOf = (group: Requirement[]) => {
      const own = this.groupContextsOf(group);
      return (scope === undefined ? own : own.slice(0, 1)).map(read);
    };
    evaluator.evaluateRequirements(this.builtComponents, nonEmpty, contextsOf);
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
          message: `${this.labelEntity(name, entityType)} belongs to a ruleset not in this character's source chain`,
          entityName: name,
          entityType,
        })),
    );
  }

  /**
   * The requirement groups that gate a modifier: its own, and its source's (an item's own requirements, a feat's
   * prerequisites).
   */
  protected gatesOf(modifier: Modifier): Requirement[][] {
    return this.data.requirementGroups.filter(([owner]) =>
      owner?.entityType === "modifiers" ? owner.entityId === modifier.id : owner?.entityId === modifier.sourceId,
    );
  }

  /**
   * Brings modifiers into the build (what a grant gives: 3.5's feat a modifier or a bonded creature's stat block makes
   * possessed), each behind its own requirements, as the view has them: what grants them is their source's gate. The
   * rounds meet them after those already there, applying them or holding them until their requirements hold.
   */
  protected joinModifiers(modifiers: Modifier[]): void {
    for (const modifier of modifiers) {
      this.data.modifiers.push(modifier);
      this.data.requirementGroups.push(this.rulesetData.requirementsByEntity.get(modifier.id) ?? []);
    }
  }

  /** An entity as an issue's message names it: its name, then its type in the ruleset's word ("Power Attack (Feat)"). */
  protected labelEntity(name: string, entityType: string): string {
    return `${name} (${this.nameEntityType(entityType)})`;
  }

  /**
   * The ruleset's word for an entity type, as an issue names it: its module's (`RulesetData.labelOf`); else the type
   * itself.
   */
  protected nameEntityType(entityType: string): string {
    return this.rulesetData.labelOf(entityType);
  }

  /** A modifier's own requirement groups, without its source's: what's read in each of its scopes (`scopesOf`). */
  protected ownGatesOf(modifier: Modifier): Requirement[][] {
    return this.data.requirementGroups.filter(
      ([owner]) => owner?.entityType === "modifiers" && owner.entityId === modifier.id,
    );
  }

  /** The ruleset's lists and indices, as its view composes them. */
  protected get rulesetData(): RulesetData {
    return this.view.rulesetData;
  }

  /**
   * Whether the groups are met, each in its own contexts (`groupContextsOf`), what `context` gives taking their place:
   * a weapon's proficiency, its base item's requirements, reads its own hand (`sourceId`), and a scope's gates its part
   * of the sheet (`scope`). A `null` source is no item: a weapon's own paths (its hand) reach nothing, as for a weapon
   * not yet held.
   */
  areRequirementsMet(requirementGroups: Requirement[][], context?: RequirementsContext): boolean {
    if (!this.builtComponents) return false;
    const { unmetRequirementGroups, invalidRequirements } = this.evaluateGroups(requirementGroups, context);
    return unmetRequirementGroups.length === 0 && invalidRequirements.length === 0;
  }

  /**
   * Builds the character from its rows (`rows`) in its ruleset's `view`: it reads nothing. A child (3.5's bonded
   * creature) is given its `parent` built; a character of its own needs none.
   */
  build(rows: CharacterRows, view: RulesetView, _parent?: CharacterBase<C, D>) {
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

    // 5. The modifiers but the late ones, in rounds behind the requirements that gate them, with what their grants give,
    // the sheet settled before each round and after it
    this.applyModifiersInRounds();

    // 6. Each component finished, from what the modifiers left
    for (const component of Object.values<CharacterComponent<D>>(this.components))
      component.finalize(this.data, view, this);

    // 7. The late modifiers, what the grants gave included, gated by the final requirement evaluation
    const lateModifiers = this.data.modifiers.filter((m) => this.isLateModifier(m));
    this.modifierEvaluator.evaluateModifiers(this.builtComponents, lateModifiers, this.requirementEvaluator);
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
    if (this.rulesetData.isInventoryType(entityType)) return this.namesOfItems().get(entityId);
    const modifier = entityType === "modifiers" ? this.data.modifiers.find((m) => m.id === entityId) : undefined;
    if (modifier) return this.resolveEntityName(modifier.sourceId, modifier.sourceType);
    return this.nameEntity(entityId, entityType);
  }
}
