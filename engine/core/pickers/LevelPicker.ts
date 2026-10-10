import type { BuildsCharacters } from "@/engine/core/character/index.ts";
import { type CharacterInput, CharacterProjection, type PickQuery } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { KlassLevel } from "@/shared/relations.ts";

import CharacterPicker, { type PickingCharacter } from "./CharacterPicker.ts";

/**
 * A feat or power picker: the level it picks at (`query`), and the character projected to it with the feats picked so
 * far, built by its ruleset's builder (`builder`), each level it projects at the hit points its ruleset counts a level
 * before they're rolled (`unrolledLevelHp`).
 */
export default abstract class LevelPicker<
  C extends PickingCharacter,
  Details extends object = object,
> extends CharacterPicker<C, { id: string }, Details> {
  constructor(
    view: RulesetView,
    input: CharacterInput,
    protected readonly query: PickQuery,
    builder: BuildsCharacters<C>,
    private readonly unrolledLevelHp: number,
  ) {
    super(view, input, builder);
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
    const hp = this.unrolledLevelHp;
    projection.addLevels(planned.klassLevelIds ?? [], { abilityIncreases: planned.abilityIncreases, hp });
    projection.pick(projection.addLevel(this.klassLevel.id, { abilityIncreases, hp }), { feats: planned.featPicks });
    return projection;
  }
}
