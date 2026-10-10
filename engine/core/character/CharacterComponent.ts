import type ModifierEvaluator from "@/engine/core/modifiers/ModifierEvaluator.ts";
import type { Components } from "@/engine/core/paths/PathTraverser.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { Requirement } from "@/shared/relations.ts";

/**
 * What a component's finish (`CharacterComponent.finalize`) reads of its character, built: its components, the
 * evaluator that applied its modifiers, and whether requirements hold on its sheet.
 */
export interface BuiltCharacter {
  areRequirementsMet(requirementGroups: Requirement[][], context?: { sourceId?: string | null }): boolean;
  readonly components: Components;
  readonly modifierEvaluator: ModifierEvaluator;
}

/**
 * A part of a character (its abilities, its skills, its combat…): data its target paths reach through the getter its
 * path category names (`ComponentSpec`, `PathTraverser.readComponent`), which modifiers change. It's built with the
 * sibling components it reads (its ruleset's factory builds each after those), and its character's build
 * (`CharacterBase.build`) sets it up from what it loaded (`initialize`, `D`) in the order the factory lists the
 * components, applies the modifiers, then finishes it (`finalize`). What it computes from its siblings it counts when
 * read; it writes none of them.
 */
export default abstract class CharacterComponent<D> {
  /** Sets the component up from the character's loaded data and its ruleset's view, once its siblings are. */
  abstract initialize(data: D, view: RulesetView): void;

  /**
   * What the component computes once the modifiers but the late ones have applied (`CharacterBase.isLateModifier`): a
   * spellcasting's slots and known spells. Nothing by default.
   */
  finalize(_data: D, _view: RulesetView, _character: BuiltCharacter): void {}
}
