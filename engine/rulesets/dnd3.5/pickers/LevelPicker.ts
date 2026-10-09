import { type CharacterInput, CharacterProjection } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { PlannedSoFar } from "@/engine/rulesets/dnd3.5/levelUp/LevelUpState.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import type { KlassLevel } from "@/shared/relations.ts";

import Picker from "./Picker.ts";

/**
 * The level a feat or a power is picked at: class `klassId`'s `level`, in the pool `aptitudeId`, after what the wizard
 * plans before it (`planned`), or a saved level's (`editedLevelId`), which a pick sees the character as it was before.
 */
export interface PickLevel {
  aptitudeId: string;
  editedLevelId?: string;
  klassId: string;
  level: number;
  planned?: PlannedSoFar;
}

/** A feat or power picker: the level it picks at, and the character built with it and the feats picked so far. */
export default abstract class LevelPicker extends Picker {
  constructor(
    view: RulesetView,
    character: CharacterInput,
    protected readonly query: PickLevel,
  ) {
    super(view, character);
    this.klassLevel = this.getKlassLevel(query.klassId, query.level);
  }

  /** The class level picked at. */
  protected readonly klassLevel: KlassLevel;

  /**
   * The character a pick is made for: as it was before the edited level (an edit), with the levels planned before this
   * one (their ability increases with them when `withAbilities`), then this class level with the feats picked so far.
   */
  protected projectPick(withAbilities: boolean) {
    const { editedLevelId, planned = {} } = this.query;
    const projection = new CharacterProjection(this.character);
    if (editedLevelId) projection.dropLevelsFrom(editedLevelId);
    const hp = LevelRules.UNROLLED_LEVEL_HP;
    const abilityIds = withAbilities ? planned.abilityIds : undefined;
    projection.addLevels(planned.klassLevelIds ?? [], { abilityIds, hp });
    projection.pick(projection.addLevel(this.klassLevel.id, { hp }), { feats: planned.featPicks });
    return projection;
  }
}
