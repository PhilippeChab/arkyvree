import type { CharacterInput, FeatPickQuery } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import FeatEntity, { type PoolModifier } from "@/engine/rulesets/dnd3.5/entities/feats/FeatEntity.ts";
import { FEAT_FAMILY } from "@/vocabulary/dnd3.5/properties/index.ts";

import Dnd35LevelPicker from "./Dnd35LevelPicker.ts";

/**
 * What a row of the grouped feat options tells beside its own columns: the pools its modifiers add slots to, whether
 * the character can take it, and the requirements it fails when it can't (a family's row: none until it's opened).
 */
export interface FeatGroupDetails {
  aptitudeModifiers: PoolModifier[];
  eligible: boolean;
  requirementTree: string | undefined;
}

/**
 * A feat picker for the character, from its rows: the pool's feats (`filters`, a family's when the query names one;
 * `groupFilters`, grouped by family), but those it holds that don't stack; each described with the pools its modifiers
 * add slots to, and a family's row described when the picker opens it (`describeGroups`).
 */
export default class FeatPicker extends Dnd35LevelPicker<{ aptitudeModifiers: PoolModifier[] }> {
  constructor(view: RulesetView, input: CharacterInput, query: FeatPickQuery) {
    super(view, input, query);
    const offered = {
      ids: this.rulesetData.listFeatIds(query.aptitudeId),
      excludeIds: this.character
        .getHeldFeats()
        .filter((feat) => !feat.stackable)
        .map((feat) => feat.id),
    };
    this.filters = { ...offered, ...(query.family && { family: { type: FEAT_FAMILY, value: query.family } }) };
    this.groupFilters = { ...offered, families: this.feats.groupByFamily(offered.ids) };
  }

  /** The feats' rules: the pools a feat's modifiers add slots to. */
  private readonly feats = new FeatEntity(this.view);

  /** What the picker offers, a family's feats when the query names one, and what it leaves out. */
  override readonly filters: { excludeIds: string[]; family?: { type: string; value: string }; ids: string[] };

  /** What the picker offers grouped by family: its feats, and the family each of them is grouped in. */
  readonly groupFilters: { excludeIds: string[]; families: { family: string; id: string }[]; ids: string[] };

  /** The pools each feat's modifiers add slots to. */
  protected override detailsOf(rows: { id: string }[]) {
    const pools = this.feats.describePoolModifiers(rows.map((row) => row.id));
    return (row: { id: string }) => ({ aptitudeModifiers: pools.get(row.id) ?? [] });
  }

  /** A row of a feat's variants, which the picker opens into them: each variant says whether it's eligible. */
  private asFamilyRow<T extends object>(row: T): T & FeatGroupDetails {
    return { ...row, eligible: true, aptitudeModifiers: [], requirementTree: undefined };
  }

  /**
   * The grouped feat options of a page: a feat without variants described as a flat option is, a family's row
   * eligible, its variants described when the picker opens it.
   */
  describeGroups<T extends { representativeId: string; variantCount: number }>(rows: T[]): (T & FeatGroupDetails)[] {
    const singles = rows.filter((row) => row.variantCount === 1).map((row) => ({ id: row.representativeId }));
    const described = new Map(this.describe(singles).map((option) => [option.id, option]));
    return rows.map((row) => {
      if (row.variantCount !== 1) return this.asFamilyRow(row);
      const option = described.get(row.representativeId);
      const eligible = option?.eligible ?? true;
      return {
        ...row,
        eligible,
        aptitudeModifiers: option?.aptitudeModifiers ?? [],
        requirementTree: eligible ? undefined : option?.requirementTree,
      };
    });
  }
}
