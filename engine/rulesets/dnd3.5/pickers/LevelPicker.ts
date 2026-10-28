import type { CharacterInput } from "@/engine/core/module/index.ts";
import { CharacterPicker } from "@/engine/core/pickers/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import CharacterProjection from "@/engine/rulesets/dnd3.5/levelUp/CharacterProjection.ts";
import type { PickQuery } from "@/engine/rulesets/dnd3.5/levelUp/requests.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import Dnd35CharacterBuilder from "@/engine/rulesets/dnd3.5/model/Dnd35CharacterBuilder.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { KlassLevel } from "@/engine/rulesets/dnd3.5/view/rows.ts";

/**
 * A feat or spell picker: the level it picks at (`query`), the character projected to it with the feats and spells
 * picked so far, whose requirements an option is checked against, and the character holding what it leaves out
 * (`holder`): with every level it has and plans, each level they project at its unrolled hit points.
 */
export default abstract class LevelPicker<Details extends object = object> extends CharacterPicker<
  DetailedCharacter,
  { id: string },
  Details
> {
  constructor(
    view: RulesetView,
    input: CharacterInput,
    protected readonly query: PickQuery,
  ) {
    super(view, input, Dnd35CharacterBuilder);
    const classLevel = Dnd35View.of(this.rulesetData).classLevelByClassAndLevel.get(`${query.classId}:${query.level}`);
    if (!classLevel) throw this.rulesetData.notFound("class-levels");
    this.classLevel = classLevel;
  }

  /** The class level picked at. */
  protected readonly classLevel: KlassLevel;

  /** The character holding what the picker leaves out, once built. */
  private heldBy?: DetailedCharacter;

  /**
   * The character a pick is made for: as it was before the edited level (an edit), with the levels planned before this
   * one and their ability increases, then this class level with its own and the feats and spells picked so far.
   */
  protected override project() {
    const { abilityIncreases, editedLevel, planned = {} } = this.query;
    const projection = new CharacterProjection(this.input);
    if (editedLevel) projection.dropLevelsFrom(editedLevel.id);
    const hp = LevelRules.UNROLLED_LEVEL_HP;
    projection.addLevels(planned.classLevelIds ?? [], { abilityIncreases: planned.abilityIncreases, hp });
    projection.pick(projection.addLevel(this.classLevel.id, { abilityIncreases, hp }), planned.picks ?? []);
    return projection.input;
  }

  /**
   * The character with every level it has and the wizard plans: this class level with its own ability increases and
   * the feats and spells picked so far (`planned.picks`), in the edited level's place (an edit), or after the levels
   * planned before it and before those planned after it.
   */
  private projectHolder() {
    const { abilityIncreases, editedLevel: replacing, laterClassLevelIds = [], planned = {} } = this.query;
    const projection = new CharacterProjection(this.input);
    const hp = LevelRules.UNROLLED_LEVEL_HP;
    projection.addLevels(planned.classLevelIds ?? [], { abilityIncreases: planned.abilityIncreases, hp });
    projection.pick(projection.addLevel(this.classLevel.id, { abilityIncreases, hp, replacing }), planned.picks ?? []);
    projection.addLevels(laterClassLevelIds, { hp });
    return projection;
  }

  /**
   * The character whose feats and spells the picker leaves out: with every level it has and the wizard plans, and the
   * feats and spells picked so far, built when first asked. A level can't pick what the character holds, picked or
   * granted at another level, a later one too, or given by a modifier, the picks so far's own too, as the save checks a
   * level's picks against what the character holds with its every other level and the level's other picks
   * (`SelectionChecks.checkPicksNotHeld`).
   */
  protected get holder(): DetailedCharacter {
    // With no level edited or planned after it, it's the character the pick is made for
    const { editedLevel, laterClassLevelIds = [] } = this.query;
    if (!editedLevel && laterClassLevelIds.length === 0) return this.character;
    return (this.heldBy ??= this.build(this.projectHolder().input));
  }
}
