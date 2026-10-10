import { type CharacterInput, CharacterProjection, type PowerPickQuery } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import { FEAT_FIELDS } from "@/engine/rulesets/dnd3.5/entities/feats/fields.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import Dnd35CharacterBuilder from "@/engine/rulesets/dnd3.5/model/Dnd35CharacterBuilder.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import { SPELL_SCHOOL } from "@/vocabulary/dnd3.5/properties/index.ts";

import Dnd35LevelPicker from "./Dnd35LevelPicker.ts";

/**
 * A power picker for the character, from its rows: the pool's powers (`filters`: of a spell level, when given), but
 * those it knows in the pool (picked, granted by its class levels, the one it's taking too, or made known by its
 * modifiers: each pool is a list of its own, which knows a power once), those of the schools a wizard's specialization
 * prohibits, and those picked so far.
 */
export default class PowerPicker extends Dnd35LevelPicker {
  constructor(view: RulesetView, input: CharacterInput, query: PowerPickQuery) {
    super(view, input, query);
    this.filters = this.buildFilters(query);
  }

  /** What the picker offers, and what it leaves out. */
  override readonly filters: { excludeIds: string[]; ids: string[] };

  /** What the picker offers and leaves out (`filters`). */
  private buildFilters({ aptitudeId, powerLevel, selectedPowerIds = [] }: PowerPickQuery) {
    // The character with the level it's taking, whose grants it holds in their pools (an edit's with its other levels)
    const known = this.buildKnowing()
      .getHeldPowers()
      .filter((power) => power.aptitudeId === aptitudeId);
    const excludeIds = [
      ...known.map((power) => power.id),
      ...this.getProhibitedPowerIds(aptitudeId),
      ...selectedPowerIds,
    ];
    return { ids: this.rulesetData.listPowerIds({ aptitudeId, level: powerLevel }), excludeIds };
  }

  /**
   * The character whose powers the picker leaves out of their pool: as it's projected, or, for an edit, with every
   * level it has, the edited one in its place with the feats picked at it, so a spell a later level knows is left out
   * too, as the edit's save refuses it (`SelectionChecks.checkPowersNotKnown`).
   */
  private buildKnowing(): DetailedCharacter {
    const { abilityIncreases, editedLevelId, planned = {} } = this.query;
    const editedLevel = this.input.rows.levels.find((level) => level.id === editedLevelId);
    if (!editedLevel) return this.character;
    const projection = new CharacterProjection(this.input);
    const hp = LevelRules.UNROLLED_LEVEL_HP;
    const level = projection.addLevel(this.klassLevel.id, { abilityIncreases, hp, replacing: editedLevel });
    projection.pick(level, { feats: planned.featPicks });
    return Dnd35CharacterBuilder.build(this.view, projection.input);
  }

  /** The wizard's spells of the schools its specialization prohibits: none for another pool. */
  private getProhibitedPowerIds(aptitudeId: string): string[] {
    const aptitude = this.rulesetData.aptitudesById.get(aptitudeId);
    if (aptitude?.name !== "Wizard Spells") return [];

    const prohibitedSchools = new Set(
      this.character.getHeldFeats().flatMap((feat) => FEAT_FIELDS.read(feat.properties).prohibitedSchools),
    );
    // The powers of each school, by the view's reverse property index
    const excludedPowerIds = new Set<string>();
    for (const school of prohibitedSchools) {
      const ids = this.rulesetData.entityIdsByProperty.get(`powers:${SPELL_SCHOOL}:${school}`) ?? [];
      for (const id of ids) excludedPowerIds.add(id);
    }
    return [...excludedPowerIds];
  }
}
