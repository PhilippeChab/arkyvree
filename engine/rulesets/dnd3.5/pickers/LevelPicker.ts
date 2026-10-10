import { type CharacterInput, CharacterProjection, type PickQuery } from "@/engine/core/module/index.ts";
import { CharacterPicker } from "@/engine/core/pickers/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import Dnd35CharacterBuilder from "@/engine/rulesets/dnd3.5/model/Dnd35CharacterBuilder.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import type { KlassLevel } from "@/shared/relations.ts";

/** A feat or power picker: the level it picks at, the character projected to it with the feats picked so far. */
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
    const klassLevel = this.rulesetData.klassLevelByKlassAndLevel.get(`${query.klassId}:${query.level}`);
    if (!klassLevel) throw new RulesError("not-found", "Class level not found");
    this.klassLevel = klassLevel;
  }

  /** The class level picked at. */
  protected readonly klassLevel: KlassLevel;

  /**
   * The character a pick is made for: as it was before the edited level (an edit), with the levels planned before this
   * one and their ability increases, then this class level with its own and the feats picked so far.
   */
  protected override project() {
    const { abilityIncreases, editedLevelId, planned = {} } = this.query;
    const projection = new CharacterProjection(this.input);
    if (editedLevelId) projection.dropLevelsFrom(editedLevelId);
    const hp = LevelRules.UNROLLED_LEVEL_HP;
    projection.addLevels(planned.klassLevelIds ?? [], { abilityIncreases: planned.abilityIncreases, hp });
    projection.pick(projection.addLevel(this.klassLevel.id, { abilityIncreases, hp }), { feats: planned.featPicks });
    return projection;
  }
}
