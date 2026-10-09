import type { CharacterInput } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { SPELL_SCHOOL } from "@/shared/dnd3.5/properties/index.ts";

import PickerState, { type PickQuery } from "./PickerState.ts";

/** A power picker's query: its level's, of a spell level, and but the schools a wizard's specialization prohibits. */
type PowerPickQuery = PickQuery & { excludeSchools?: string[]; powerLevel?: number };

/**
 * A power picker for the character, from its rows: what it offers and leaves out (`filters`: of a spell level, and
 * but the schools a specialization prohibits), which the server reads a page of options with, and the page annotated.
 */
export default class PowerPicker extends PickerState {
  constructor(view: RulesetView, character: CharacterInput, query: PowerPickQuery) {
    super(view, character, query);
    this.built = this.build(this.projectPick(false));
    this.filters = this.buildFilters(query);
  }

  /** The character the pick is made for. */
  private readonly built: DetailedCharacter;

  /** What the picker offers, and the powers it leaves out. */
  readonly filters: { excludePowerIds: string[]; ids: string[] };

  /**
   * What the picker offers and leaves out: the pool's powers (of `powerLevel`, when given), but those the character
   * knows in the pool (the edited level and those after it aside), those its class level grants, those its modifiers
   * give it, and those of the schools a wizard's specialization prohibits (`excludeSchools`, the wizard step's).
   */
  private buildFilters({ aptitudeId, excludeSchools, powerLevel }: PowerPickQuery) {
    const excludePowerIds = this.built.getKnownPowerIds(aptitudeId);
    for (const rec of this.rulesetData.klassLevelPowersWithPowersByKlassLevel.get(this.klassLevel.id) ?? [])
      excludePowerIds.push(rec.powersInRule.id);
    excludePowerIds.push(...this.built.getVirtuallyPossessedPowerIds());
    excludePowerIds.push(...this.getProhibitedPowerIds(aptitudeId, excludeSchools ?? []));
    return { ids: this.rulesetData.listPowerIds({ aptitudeId, level: powerLevel }), excludePowerIds };
  }

  /**
   * The wizard's spells of the schools its specialization prohibits, and of those the wizard step excludes
   * (`clientExcludeSchools`): none for another pool.
   */
  private getProhibitedPowerIds(aptitudeId: string, clientExcludeSchools: string[]): string[] {
    const aptitude = this.rulesetData.aptitudesById.get(aptitudeId);
    if (aptitude?.name !== "Wizard Spells") return [];

    const prohibitedSchools = new Set<string>(clientExcludeSchools);
    for (const school of this.built.getProhibitedSchools()) prohibitedSchools.add(school);

    if (prohibitedSchools.size === 0) return [];

    // Look up power IDs by school via the reverse property index — O(k) instead
    // of O(P) where P is all composed powers.
    const excludedPowerIds = new Set<string>();
    for (const school of prohibitedSchools) {
      const ids = this.rulesetData.entityIdsByPropertyLookup.get(`powers:${SPELL_SCHOOL}:${school}`) ?? [];
      for (const id of ids) excludedPowerIds.add(id);
    }
    return [...excludedPowerIds];
  }

  /** The power options of a page, each with whether the character meets its requirements, and the tree it fails. */
  annotate<T extends { id: string }>(items: T[]) {
    return this.annotateRequirements(this.built, items);
  }
}
