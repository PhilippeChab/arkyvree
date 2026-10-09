import type { CharacterInput } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import { FEAT_FIELDS } from "@/engine/rulesets/dnd3.5/entities/feats/fields.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { SPELL_SCHOOL } from "@/shared/dnd3.5/properties/index.ts";

import LevelPicker, { type PickLevel } from "./LevelPicker.ts";

/** A power picker's query: its level's, of a spell level, and the powers picked so far at it. */
type PowerPickQuery = PickLevel & { powerLevel?: number; selectedPowerIds?: string[] };

/**
 * A power picker for the character, from its rows: what it offers and leaves out (`filters`: of a spell level, but what
 * the character knows or can't learn), which the server reads a page of options with, and a page described.
 */
export default class PowerPicker extends LevelPicker {
  constructor(view: RulesetView, character: CharacterInput, query: PowerPickQuery) {
    super(view, character, query);
    this.built = this.build(this.projectPick());
    this.filters = this.buildFilters(query);
  }

  /** The character the pick is made for. */
  private readonly built: DetailedCharacter;

  /** What the picker offers, and the powers it leaves out. */
  readonly filters: { excludePowerIds: string[]; ids: string[] };

  /**
   * What the picker offers and leaves out: the pool's powers (of `powerLevel`, when given), but those the character
   * knows in the pool (the edited level and those after it aside), those its class level grants, those its modifiers
   * give it, those of the schools a wizard's specialization prohibits, and those picked so far (`selectedPowerIds`).
   */
  private buildFilters({ aptitudeId, powerLevel, selectedPowerIds = [] }: PowerPickQuery) {
    const held = this.built.getHeldPowers();
    const excludePowerIds = held.filter((power) => power.aptitudeId === aptitudeId).map((power) => power.id);
    for (const rec of this.rulesetData.klassLevelPowersWithPowersByKlassLevel.get(this.klassLevel.id) ?? [])
      excludePowerIds.push(rec.powersInRule.id);
    excludePowerIds.push(...held.filter((power) => power.virtual).map((power) => power.id));
    excludePowerIds.push(...this.getProhibitedPowerIds(aptitudeId));
    excludePowerIds.push(...selectedPowerIds);
    return { ids: this.rulesetData.listPowerIds({ aptitudeId, level: powerLevel }), excludePowerIds };
  }

  /** The wizard's spells of the schools its specialization prohibits: none for another pool. */
  private getProhibitedPowerIds(aptitudeId: string): string[] {
    const aptitude = this.rulesetData.aptitudesById.get(aptitudeId);
    if (aptitude?.name !== "Wizard Spells") return [];

    const prohibitedSchools = new Set(
      this.built.getHeldFeats().flatMap((feat) => FEAT_FIELDS.read(feat.properties).prohibitedSchools),
    );
    // The powers of each school, by the view's reverse property index
    const excludedPowerIds = new Set<string>();
    for (const school of prohibitedSchools) {
      const ids = this.rulesetData.entityIdsByPropertyLookup.get(`powers:${SPELL_SCHOOL}:${school}`) ?? [];
      for (const id of ids) excludedPowerIds.add(id);
    }
    return [...excludedPowerIds];
  }

  /** The power options of a page, each with whether the character meets its requirements, and the tree it fails. */
  describe<T extends { id: string }>(items: T[]) {
    return this.describeEligibility(this.built, items);
  }
}
