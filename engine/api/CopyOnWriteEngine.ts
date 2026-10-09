import {
  type CowData,
  CowDataBuilder,
  type CowRows,
  CowSources,
  ExtensionNames,
  NAME_PAIRED_ENTITY_TYPES,
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
  /** The types whose entities pair by name in a view, whoever holds them: a subscribe reads none of their names. */
  readonly namePairedEntityTypes: readonly string[] = NAME_PAIRED_ENTITY_TYPES;

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
   * by its copy-on-write data (`cow`), each entity's properties in its rules' order.
   */
  buildView(ruleset: { baseRules: BaseRules }, chain: RulesetRawData[], cow: CowData): RulesetData {
    const { orderProperties } = Modules.of(ruleset.baseRules);
    return new RulesetComposition(chain, cow, orderProperties).build();
  }

  /** Refuses subscribing a ruleset to new extensions that would surface two entities of a name in its view. */
  checkExtensionNames(...args: Parameters<typeof ExtensionNames.check>) {
    ExtensionNames.check(...args);
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
