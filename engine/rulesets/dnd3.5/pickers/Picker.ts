import type { CharacterInput } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import LevelUpState from "@/engine/rulesets/dnd3.5/levelUp/LevelUpState.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";

/**
 * A level-up's picker for a character, from its rows: what it offers (`filters`, which the server reads a page of
 * options with), and each option of a page described for the character (`describe`), with whether it meets the
 * option's requirements and what else its kind says of it.
 */
export default abstract class Picker extends LevelUpState {
  constructor(
    view: RulesetView,
    protected readonly character: CharacterInput,
  ) {
    super(view);
  }

  /** What the picker offers, which the server reads a page of options with. */
  abstract readonly filters: object;

  /**
   * The options of a page (`candidates`), each with whether `character` meets its requirements, and the tree of those
   * it fails.
   */
  protected describeEligibility<T extends { id: string }>(
    character: DetailedCharacter,
    candidates: T[],
  ): (T & { eligible: boolean; requirementTree?: string })[] {
    if (candidates.length === 0) return [];
    return this.rulesetData.cow.resolveRows(candidates).map((candidate) => {
      const requirements = this.rulesetData.requirementsByEntity.get(candidate.id);
      const eligible = !requirements || requirements.length === 0 || character.areRequirementsMet([requirements]);
      return {
        ...candidate,
        eligible,
        ...(!eligible && requirements ? { requirementTree: character.formatRequirements(requirements) } : {}),
      };
    });
  }
}
