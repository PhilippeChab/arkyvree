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
   * by its copy-on-write data (`cow`), with its rules' property types: each entity's properties in their order, and the
   * entity a property's value names.
   */
  buildView(ruleset: { baseRules: BaseRules }, chain: RulesetRawData[], cow: CowData): RulesetData {
    return new RulesetComposition(chain, cow, Modules.of(ruleset.baseRules).createPropertyTypes()).build();
  }

  /** The classes whose levels pair by number: those the ruleset copied (its snapshots say), and their sources. */
  getPairedKlassIds(rulesetId: string, snapshots: CowRows["snapshots"]) {
    return CowSources.getPairedKlassIds(rulesetId, snapshots);
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
    return SiblingMerge.mergeCustomizations(own, siblings, targetEntityId);
  }
}
