import type { CharacterInput } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import FeatEntity, { type PoolModifier } from "@/engine/rulesets/dnd3.5/entities/feats/FeatEntity.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { FEAT_FAMILY } from "@/shared/dnd3.5/properties/index.ts";

import LevelPicker, { type PickLevel } from "./LevelPicker.ts";

/**
 * A feat picker for the character, from its rows: what it offers and leaves out, which the server reads a page of
 * options with (`filters`, a family's feats when the query names one; `groupFilters`, the feats grouped by family),
 * and a page described for the character built with the level's picks so far (`describe`, `describeGroups`).
 */
export default class FeatPicker extends LevelPicker {
  constructor(view: RulesetView, character: CharacterInput, query: PickLevel & { family?: string }) {
    super(view, character, query);
    this.built = this.build(this.projectPick());
    const offered = {
      ids: this.rulesetData.listFeatIds(query.aptitudeId),
      excludeFeatIds: this.built
        .getHeldFeats()
        .filter((feat) => !feat.stackable)
        .map((feat) => feat.id),
    };
    this.filters = { ...offered, ...(query.family && { family: { type: FEAT_FAMILY, value: query.family } }) };
    this.groupFilters = { ...offered, familyType: FEAT_FAMILY };
  }

  /** The character the pick is made for. */
  private readonly built: DetailedCharacter;

  /** The feats' rules: the pools a feat's modifiers add slots to. */
  private readonly feats = new FeatEntity(this.view);

  /**
   * What the picker offers and leaves out: the pool's feats as the ruleset composes the list (a family's, when the query
   * names one), but those the character can't take again (a feat that doesn't stack, held already).
   */
  readonly filters: { excludeFeatIds: string[]; family?: { type: string; value: string }; ids: string[] };

  /** What the picker offers grouped by family: its feats, and the property their family is kept in. */
  readonly groupFilters: { excludeFeatIds: string[]; familyType: string; ids: string[] };

  /** A row of a feat's variants, which the picker opens into them: each variant says whether it's eligible. */
  private asFamilyRow<T extends object>(row: T) {
    return {
      ...row,
      eligible: true as boolean,
      aptitudeModifiers: [] as PoolModifier[],
      requirementTree: undefined as string | undefined,
    };
  }

  /**
   * The feat options of a page, each with whether the character meets its requirements (and the tree it fails) and the
   * pools its modifiers add slots to.
   */
  describe<T extends { id: string }>(items: T[]) {
    const described = this.describeEligibility(this.built, items);
    const pools = this.feats.describePoolModifiers(described.map((feat) => feat.id));
    return described.map((item) => ({ ...item, aptitudeModifiers: pools.get(item.id) ?? [] }));
  }

  /**
   * The grouped feat options of a page: a feat without variants described as a flat option is, a family's row eligible,
   * its variants described when the picker opens it.
   */
  describeGroups<T extends { representativeId: string; variantCount: number }>(rows: T[]) {
    const singleRows = rows.filter((row) => row.variantCount === 1);
    if (singleRows.length === 0) return rows.map((row) => this.asFamilyRow(row));

    const described = this.describeEligibility(
      this.built,
      singleRows.map((row) => ({ id: row.representativeId })),
    );
    const byId = new Map(described.map((feat) => [feat.id, feat]));
    const pools = this.feats.describePoolModifiers(singleRows.map((row) => row.representativeId));

    return rows.map((row) => {
      if (row.variantCount !== 1) return this.asFamilyRow(row);
      const eligible = byId.get(row.representativeId)?.eligible ?? true;
      return {
        ...row,
        eligible,
        aptitudeModifiers: pools.get(row.representativeId) ?? [],
        requirementTree: eligible ? undefined : byId.get(row.representativeId)?.requirementTree,
      };
    });
  }
}
