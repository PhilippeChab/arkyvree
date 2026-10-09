import {
  type CowData,
  CowDataBuilder,
  type CowRows,
  CowSources,
  ExtensionNames,
  NAME_PAIRED_ENTITY_TYPES as PAIRED_TYPES,
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

import { getRulesetModule } from "./modules.ts";

/** The types whose entities pair by name in a view, whoever holds them: a subscribe reads none of their names. */
export const NAME_PAIRED_ENTITY_TYPES: readonly string[] = PAIRED_TYPES;

/** A ruleset's copy-on-write data, from the rows read for it (`getCowReads`, `getPairedKlassIds`). */
export function buildCowData(ruleset: RulesetSources, rows: CowRows): CowData {
  return CowDataBuilder.build(ruleset, rows);
}

/**
 * A ruleset's view: its own rows and its source chain's (`chain`, its own first, then its chain's in order), composed
 * by its copy-on-write data (`cow`), each entity's properties in its rules' order.
 */
export function buildRulesetView(
  ruleset: { baseRules: BaseRules },
  chain: RulesetRawData[],
  cow: CowData,
): RulesetData {
  const { orderProperties } = getRulesetModule(ruleset.baseRules);
  return new RulesetComposition(chain, cow, orderProperties).build();
}

/** A ruleset's source chain: its extensions first (their new entities are visible), then its ancestors. */
export function buildSourceChain(ruleset: Omit<RulesetSources, "id">): string[] {
  return CowSources.buildSourceChain(ruleset);
}

/** Refuses subscribing a ruleset to new extensions that would surface two entities of a name in its view. */
export function checkExtensionNames(...args: Parameters<typeof ExtensionNames.check>) {
  ExtensionNames.check(...args);
}

/** What a ruleset's copy-on-write data is read from, each read none when it needs none. */
export function getCowReads(ruleset: RulesetSources) {
  return CowSources.getReads(ruleset);
}

/** The ids of the ruleset's feats on a list, as the ruleset composes it. */
export function getListFeatIds(rulesetData: RulesetData, aptitudeId: string): string[] {
  return rulesetData.listFeatIds(aptitudeId);
}

/** The ids of the ruleset's spells on a list, at a level when one is given (on any list when none is). */
export function getListPowerIds(rulesetData: RulesetData, where: { aptitudeId?: string; level?: number }): string[] {
  return rulesetData.listPowerIds(where);
}

/** The classes whose levels pair by number: those the ruleset copied (its snapshots say), and their sources. */
export function getPairedKlassIds(rulesetId: string, snapshots: CowRows["snapshots"]) {
  return CowSources.getPairedKlassIds(rulesetId, snapshots);
}

/** The siblings' links to aptitudes the winner doesn't link to, by the aptitude `resolve` gives. */
export function mergeSiblingAptitudeLinks<T extends { aptitudeId: string }>(
  own: readonly T[],
  siblings: Iterable<readonly T[]>,
  resolve: (id: string) => string,
): T[] {
  return SiblingMerge.mergeAptitudeLinks(own, siblings, resolve);
}

/** What a copy of a sibling winner takes of its siblings' customizations beside its own, merged as the view merges. */
export function mergeSiblingCustomizations(
  own: EntityCustomizations,
  siblings: EntityCustomizations[],
  targetEntityId: string,
): EntityCustomizations {
  return SiblingMerge.mergeCustomizations(own, siblings, targetEntityId);
}
