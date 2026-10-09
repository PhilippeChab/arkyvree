import type { CharacterInput } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import { AnnotatesOptions } from "@/engine/rulesets/dnd3.5/levelUp/concerns/AnnotatesOptions.ts";
import LevelUpState from "@/engine/rulesets/dnd3.5/levelUp/LevelUpState.ts";
import CharacterProjection, { type FeatPick } from "@/engine/rulesets/dnd3.5/projection/CharacterProjection.ts";
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
export default abstract class PickerState extends include(LevelUpState, AnnotatesOptions) {
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
   * The character a pick is made for: as it was before the edited level (an edit), with the levels planned before this
   * one (their ability increases with them when `withAbilities`), then this class level with the feats picked so far.
   */
  protected projectPick(withAbilities: boolean) {
    const { excludeCharacterLevelId, pendingLevelAbilityIds, pendingLevelKlassLevelIds } = this.query;
    const projection = new CharacterProjection(this.view, this.character);
    if (excludeCharacterLevelId) projection.dropLevelsFrom(excludeCharacterLevelId);
    projection.addLevels(pendingLevelKlassLevelIds ?? [], withAbilities ? pendingLevelAbilityIds : undefined);
    const level = projection.addLevel(this.klassLevel.id);
    projection.pickFeats(level, this.featPicks);
    return { level, projection };
  }
}
