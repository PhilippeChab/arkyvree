import type { CharacterInput, PowerPickQuery } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import { FEAT_FIELDS } from "@/engine/rulesets/dnd3.5/entities/feats/fields.ts";
import { SPELL_SCHOOL } from "@/vocabulary/dnd3.5/properties/index.ts";

import Dnd35LevelPicker from "./Dnd35LevelPicker.ts";

/**
 * A power picker for the character, from its rows: the pool's powers (`filters`: of a spell level, when given), but
 * those it knows in the pool, those its class level grants, those its modifiers give it, those of the schools a wizard's
 * specialization prohibits, and those picked so far.
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
    const held = this.character.getHeldPowers();
    const excludeIds = held.filter((power) => power.aptitudeId === aptitudeId).map((power) => power.id);
    for (const rec of this.rulesetData.klassLevelPowersWithPowersByKlassLevel.get(this.klassLevel.id) ?? [])
      excludeIds.push(rec.powersInRule.id);
    excludeIds.push(...held.filter((power) => power.virtual).map((power) => power.id));
    excludeIds.push(...this.getProhibitedPowerIds(aptitudeId));
    excludeIds.push(...selectedPowerIds);
    return { ids: this.rulesetData.listPowerIds({ aptitudeId, level: powerLevel }), excludeIds };
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
