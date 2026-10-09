import { type CharacterInput, CharacterProjection } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { PlannedSoFar } from "@/engine/rulesets/dnd3.5/levelUp/LevelUpState.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import type { KlassLevel } from "@/shared/relations.ts";

import CharacterPicker from "./CharacterPicker.ts";

/**
 * The level a feat or a power is picked at: class `klassId`'s `level` with its ability increase (`abilityId`), in the
 * pool `aptitudeId`, after the levels the wizard plans before it (`planned`), or a saved level's (`editedLevelId`),
 * which a pick sees the character as it was before.
 */
export interface PickLevel {
  abilityId?: string;
  aptitudeId: string;
  editedLevelId?: string;
  klassId: string;
  level: number;
  planned?: PlannedSoFar;
}

/** A feat or power picker: the level it picks at, the character projected to it with the feats picked so far. */
export default abstract class LevelPicker<Details extends object = object> extends CharacterPicker<
  { id: string },
  Details
> {
  constructor(
    view: RulesetView,
    input: CharacterInput,
    protected readonly query: PickLevel,
  ) {
    super(view, input);
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
  protected project() {
    const { abilityId, editedLevelId, planned = {} } = this.query;
    const projection = new CharacterProjection(this.input);
    if (editedLevelId) projection.dropLevelsFrom(editedLevelId);
    const hp = LevelRules.UNROLLED_LEVEL_HP;
    projection.addLevels(planned.klassLevelIds ?? [], { abilityIds: planned.abilityIds, hp });
    projection.pick(projection.addLevel(this.klassLevel.id, { abilityId, hp }), { feats: planned.featPicks });
    return projection;
  }
}
