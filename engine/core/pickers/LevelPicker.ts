import type { BuildsCharacters } from "@/engine/core/character/index.ts";
import { type CharacterInput, CharacterProjection, type PickQuery } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { KlassLevel } from "@/shared/relations.ts";

import CharacterPicker, { type PickingCharacter } from "./CharacterPicker.ts";

/**
 * A feat or power picker: the level it picks at (`query`), the character projected to it with the feats picked so far,
 * whose requirements an option is checked against, and the character holding what it leaves out (`holder`): with every
 * level it has and plans. Both are built by its ruleset's builder (`builder`), each level they project at the hit
 * points its ruleset counts a level before they're rolled (`unrolledLevelHp`).
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

  /** The character holding what the picker leaves out, once built. */
  private heldBy?: C;

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

  /**
   * The character with every level it has and the wizard plans: this class level with its own ability increases and
   * the feats picked so far, in the edited level's place (an edit), or after the levels planned before it and before
   * those planned after it.
   */
  private projectHolder() {
    const { abilityIncreases, editedLevelId, laterKlassLevelIds = [], planned = {} } = this.query;
    const projection = new CharacterProjection(this.input);
    const hp = this.unrolledLevelHp;
    const replacing = this.input.rows.levels.find((level) => level.id === editedLevelId);
    projection.addLevels(planned.klassLevelIds ?? [], { abilityIncreases: planned.abilityIncreases, hp });
    const level = projection.addLevel(this.klassLevel.id, { abilityIncreases, hp, replacing });
    projection.pick(level, { feats: planned.featPicks });
    projection.addLevels(laterKlassLevelIds, { hp });
    return projection;
  }

  /**
   * The character whose feats and powers the picker leaves out: with every level it has and the wizard plans, built
   * when first asked. A level can't pick what the character holds, picked or granted at another level, a later one too,
   * or given by a modifier, as the save checks a level's picks against what the character holds with its every other
   * level (`SelectionChecks.checkFeatsNotHeld`, `checkPowersNotKnown`).
   */
  protected get holder(): C {
    // With no level edited or planned after it, it's the character the pick is made for
    const { editedLevelId, laterKlassLevelIds = [] } = this.query;
    if (!editedLevelId && laterKlassLevelIds.length === 0) return this.character;
    return (this.heldBy ??= this.build(this.projectHolder()));
  }
}
