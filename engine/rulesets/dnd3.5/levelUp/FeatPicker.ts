import type { CharacterInput } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/types.ts";
import type Dnd35DetailedCharacter from "@/engine/rulesets/dnd3.5/character/DetailedCharacter.ts";
import type { Dnd35ProjectedCharacterData } from "@/engine/rulesets/dnd3.5/types.ts";
import { FEAT_FAMILY } from "@/shared/dnd3.5/properties/index.ts";

import type { AptitudeModifier } from "./concerns/AnnotatesOptions.ts";
import PickerState, { type PickQuery } from "./PickerState.ts";

/**
 * A feat picker for the character, from its rows: what it offers and leaves out (`filters`), which the server reads a
 * page of options with, and the page annotated for the character built with the level's picks so far.
 */
export default class FeatPicker extends PickerState {
  constructor(view: RulesetView, character: CharacterInput, query: PickQuery) {
    super(view, character, query);
    this.built = this.build(character, this.projectFeatPick());
    this.filters = {
      ids: this.rulesetData.listFeatIds(query.aptitudeId),
      excludeFeatIds: this.built.getHeldNonStackableFeatIds(),
      familyType: FEAT_FAMILY,
    };
  }

  /** The character the pick is made for. */
  private readonly built: Dnd35DetailedCharacter;

  /**
   * What the picker offers and leaves out: the pool's feats as the ruleset composes the list, but those the character
   * can't take again (a feat that doesn't stack, held already).
   */
  readonly filters: { excludeFeatIds: string[]; familyType: string; ids: string[] };

  /** A row of a feat's variants, which the picker opens into them: each variant says whether it's eligible. */
  private asFamilyRow<T extends object>(row: T) {
    return {
      ...row,
      eligible: true as boolean,
      aptitudeModifiers: [] as AptitudeModifier[],
      requirementTree: undefined as string | undefined,
    };
  }

  /**
   * The character a feat pick is made for: the levels planned before this one, then this class level, the feats picked
   * so far and every feat those class levels grant. Granted feats count for requirements (a weapon proficiency for
   * Weapon Focus) and aren't offered. Editing a level leaves out it and the levels after it.
   */
  private projectFeatPick(): Dnd35ProjectedCharacterData {
    const klassLevelId = this.klassLevel.id;
    const grantingKlassLevelIds = [...new Set([klassLevelId, ...(this.query.pendingLevelKlassLevelIds ?? [])])];
    const grantedRecords = grantingKlassLevelIds.flatMap(
      (id) => this.rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(id) ?? [],
    );
    const grantedCustomizations = this.loadFeatCustomizations(grantedRecords.map((rec) => rec.featsInRule.id));
    const { excludeIds, level, pendingLevels } = this.projectPickLevels(true);
    const projectedFeats = this.buildProjectedFeatsFromPicks(this.featPicks, klassLevelId, level.id);
    return {
      ...(excludeIds.length > 0 && { excludeCharacterLevelIds: excludeIds }),
      characterLevels: [...pendingLevels, level],
      ...(projectedFeats.length > 0 && { feats: projectedFeats }),
      givenFeats: this.buildProjectedGivenFeats(grantedRecords, level.id, grantedCustomizations),
    };
  }

  /**
   * The feat options of a page, each with whether the character meets its requirements (and the tree it fails) and the
   * pools its modifiers add slots to.
   */
  annotate<T extends { id: string }>(items: T[]) {
    const annotated = this.annotateRequirements(this.built, items);
    const aptitudeModByFeat = this.resolveAptitudeModifiers(annotated.map((f) => f.id));
    return annotated.map((item) => ({ ...item, aptitudeModifiers: aptitudeModByFeat.get(item.id) ?? [] }));
  }

  /**
   * The grouped feat options of a page: a feat without variants annotated as a flat option is, a family's row eligible,
   * its variants annotated when the picker opens it.
   */
  annotateGroups<T extends { representativeId: string; variantCount: number }>(rows: T[]) {
    const singleRows = rows.filter((r) => r.variantCount === 1);
    if (singleRows.length === 0) return rows.map((row) => this.asFamilyRow(row));

    const singleIds = singleRows.map((r) => ({ id: r.representativeId }));
    const annotated = this.annotateRequirements(this.built, singleIds);
    const eligibilityMap = new Map(annotated.map((a) => [a.id, a.eligible]));
    const requirementTreeMap = new Map(
      annotated.filter((a) => a.requirementTree).map((a) => [a.id, a.requirementTree!]),
    );
    const aptitudeModByFeat = this.resolveAptitudeModifiers(singleRows.map((r) => r.representativeId));

    return rows.map((row) => {
      if (row.variantCount === 1) {
        const eligible = eligibilityMap.get(row.representativeId) ?? true;
        return {
          ...row,
          eligible,
          aptitudeModifiers: aptitudeModByFeat.get(row.representativeId) ?? [],
          requirementTree: eligible ? undefined : requirementTreeMap.get(row.representativeId),
        };
      }
      return this.asFamilyRow(row);
    });
  }
}
