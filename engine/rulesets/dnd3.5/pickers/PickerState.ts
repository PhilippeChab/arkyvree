import type { CharacterInput } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import { AnnotatesOptions } from "@/engine/rulesets/dnd3.5/levelUp/concerns/AnnotatesOptions.ts";
import { Projects } from "@/engine/rulesets/dnd3.5/levelUp/concerns/Projects.ts";
import LevelUpState, { type FeatPick } from "@/engine/rulesets/dnd3.5/levelUp/LevelUpState.ts";
import { include } from "@/lib/mixins.ts";
import type { KlassLevel } from "@/shared/relations.ts";

/** What a picker's level is: class `klassId`'s `level`, after the levels planned before it, or an edit's. */
export interface PickQuery {
  /** The pool picked in */
  aptitudeId: string;
  /** The edited level, which the projection leaves out with every later one. */
  excludeCharacterLevelId?: string;
  klassId: string;
  level: number;
  pendingLevelAbilityIds?: (string | undefined)[];
  /** The feats the wizard's pending levels and this one picked so far */
  pendingLevelFeatPicks?: FeatPick[];
  pendingLevelKlassLevelIds?: string[];
  selectedFeatPicks?: FeatPick[];
}

/**
 * A feat or power picker for a character, from its rows: the level picked at (class `klassId`'s `level`), and the
 * character built with the level and the picks so far, which its options are offered and annotated for.
 */
export default abstract class PickerState extends include(LevelUpState, AnnotatesOptions, Projects) {
  constructor(
    view: RulesetView,
    protected readonly character: CharacterInput,
    protected readonly query: PickQuery,
  ) {
    super(view);
    this.klassLevel = this.getKlassLevel(query.klassId, query.level);
  }

  /** The class level picked at. */
  protected readonly klassLevel: KlassLevel;

  /** The feats the wizard's pending levels and this one picked so far. */
  protected get featPicks(): FeatPick[] {
    return [...(this.query.pendingLevelFeatPicks ?? []), ...(this.query.selectedFeatPicks ?? [])];
  }

  /**
   * The projection's levels: the pending ones and the picker's own, without the edited level and those after it; the
   * pending ones with their ability increases when `withAbilities`.
   */
  protected projectPickLevels(withAbilities: boolean) {
    const { excludeCharacterLevelId, pendingLevelAbilityIds, pendingLevelKlassLevelIds } = this.query;
    const characterId = this.character.record.id;
    const excludeIds = excludeCharacterLevelId
      ? this.getLevelIdsFromOnward(this.character.rows.levels, excludeCharacterLevelId)
      : [];
    const pendingLevels = pendingLevelKlassLevelIds?.length
      ? this.buildPendingCharacterLevels(
          characterId,
          pendingLevelKlassLevelIds,
          withAbilities ? pendingLevelAbilityIds : undefined,
        )
      : [];
    const level = this.buildProjectedCharacterLevel(characterId, this.klassLevel.id);
    return { excludeIds, level, pendingLevels };
  }
}
