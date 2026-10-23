import {
  type CowData,
  CowDataBuilder,
  type CowRows,
  CowSources,
  type RulesetSources,
} from "@/engine/core/cow/index.ts";
import {
  type EntityCustomizations,
  RulesetComposition,
  type RulesetData,
  type RulesetRawData,
  SiblingMerge,
} from "@/engine/core/view/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

import Modules from "./Modules.ts";
import StorageEngine from "./StorageEngine.ts";

/**
 * Whether a property type holds a single value, as every module stores it: a field that isn't a set, or a property a
 * single link holds (a class's bonus spell ability). A sibling merge takes one of it (`SiblingMerge`).
 */
function singleValued(entityType: string, type: string) {
  const storage = StorageEngine.shared();
  return (
    storage
      .registries()
      .fieldDefs.some((field) => field.ownerType === entityType && field.field === type && !field.multiple) ||
    storage.linkedProperty(entityType, type) !== undefined
  );
}

/**
 * The engine's copy-on-write: what a ruleset's view is built from and of, which copy-on-write's views and writes ask
 * before there's a view to bind.
 */
export default class CopyOnWriteEngine {
  /** A ruleset's copy-on-write data, from the rows read for it (`getReads`, `getPairedKlassIds`). */
  buildData(ruleset: RulesetSources, rows: CowRows): CowData {
    return CowDataBuilder.build(ruleset, rows);
  }

  /** A ruleset's source chain: its extensions first (their new entities are visible), then its ancestors. */
  buildSourceChain(ruleset: Omit<RulesetSources, "id">): string[] {
    return CowSources.buildSourceChain(ruleset);
  }

  /**
   * A ruleset's view: its own rows and its source chain's (`chain`, its own first, then its chain's in order), composed
   * by its copy-on-write data (`cow`), with its rules' property types: each entity's properties in their order.
   */
  buildView(ruleset: { baseRules: BaseRules }, chain: RulesetRawData[], cow: CowData): RulesetData {
    const module = Modules.of(ruleset.baseRules);
    return new RulesetComposition(chain, cow, module.propertyTypes, singleValued).build();
  }

  /**
   * The classes whose levels pair by number: those the ruleset and its source chain copied (their snapshots say) and
   * their sources, and those of its own and its extensions' of a name both have.
   */
  getPairedKlassIds(rows: Pick<CowRows, "ownNamesakes" | "snapshots">) {
    return CowSources.getPairedKlassIds(rows);
  }

  /** What a ruleset's copy-on-write data is read from, each read none when it needs none. */
  getReads(ruleset: RulesetSources) {
    return CowSources.getReads(ruleset);
  }

  /** The siblings' links to aptitudes the winner doesn't link to, by the aptitude `resolve` gives. */
  mergeAptitudeLinks<T extends { aptitudeId: string }>(
    own: readonly T[],
    siblings: Iterable<readonly T[]>,
    resolve: (id: string) => string,
  ): T[] {
    return SiblingMerge.mergeAptitudeLinks(own, siblings, resolve);
  }

  /** What a copy of a sibling winner takes of its siblings' customizations beside its own, merged as the view merges. */
  mergeCustomizations(
    own: EntityCustomizations,
    siblings: EntityCustomizations[],
    targetEntityId: string,
  ): EntityCustomizations {
    return SiblingMerge.mergeCustomizations(own, siblings, targetEntityId, singleValued);
  }
}
