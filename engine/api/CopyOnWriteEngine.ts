import {
  type CowData,
  CowDataBuilder,
  type CowKinds,
  type CowRows,
  CowSources,
  type RulesetSources,
} from "@/engine/core/cow/index.ts";
import type { StoredEntity, StoredRuleset } from "@/engine/core/module/index.ts";
import {
  type EntityCustomizations,
  RulesetComposition,
  type RulesetData,
  type RulesetRawData,
  SiblingMerge,
} from "@/engine/core/view/index.ts";
import type { BaseRules } from "@/shared/enums.ts";
import type { Modifier, Requirement } from "@/shared/relations.ts";

import Modules from "./Modules.ts";
import StorageEngine from "./StorageEngine.ts";

/** A ruleset's own stored rows, as the server reads them for its view (`buildRawData`). */
export interface StoredRulesetRows {
  /** Its live entities, every kind's, by name then id */
  entities: StoredEntity[];
  /** Every modifier whose source is one of its entities, every requirement of them or of those modifiers */
  modifiers: Modifier[];
  requirements: Requirement[];
  /** Its own settings, none for a campaign's rows */
  ruleset?: StoredRuleset;
  /** The entities its entities' lists name (a feat's pools' aptitudes), wherever they're from */
  targets: StoredEntity[];
  /** Of `targets`, those a link of a join with a tier points at, from any ruleset (a spell list's at a level) */
  tieredIds: Set<string>;
}

/**
 * The engine's copy-on-write: what a ruleset's view is built from and of, which copy-on-write's views and writes ask
 * before there's a view to bind.
 */
export default class CopyOnWriteEngine {
  /** How every module's kinds pair in a ruleset's chain, by their storage declarations. */
  private static kinds(): CowKinds {
    const storage = StorageEngine.shared();
    return {
      identities: storage.namesakeKinds("identity"),
      owned: storage.ownedTypes(),
      owners: storage.ownerKinds(),
      reprints: storage.namesakeKinds("reprints"),
    };
  }

  /** A ruleset's copy-on-write data, from the rows read for it (`getReads`, `getPairedOwnerIds`). */
  buildData(ruleset: RulesetSources, rows: CowRows): CowData {
    return CowDataBuilder.build(ruleset, rows);
  }

  /**
   * A ruleset's own rows as its view composes them, off its stored rows (`stored`): each kind's rows by its type, as its
   * module's declaration reads them (a list's with its lists), an owned kind's by position and owner, and only those
   * whose owner it holds; each join's rows of its entities but those a kind's list carries; their stored values and its
   * own Settings', kind-wide too (`StorageEngine.valuesOf`), its modifiers and requirements.
   */
  buildRawData(stored: StoredRulesetRows): RulesetRawData {
    const storage = StorageEngine.shared();
    const targets = new Map(stored.targets.map((target) => [target.id, target]));
    const types = storage.registries().entityTypes;
    const ids = new Set(stored.entities.map((entity) => entity.id));
    const live = stored.entities.filter((entity) => entity.ownerId === null || ids.has(entity.ownerId));
    const entities: RulesetRawData["entities"] = {};
    for (const { ownerType, type } of types) {
      const ofType = live.filter((entity) => entity.type === type);
      if (ownerType) {
        ofType.sort(
          (a, b) => a.position! - b.position! || (a.ownerId! < b.ownerId! ? -1 : a.ownerId! > b.ownerId! ? 1 : 0),
        );
      }
      entities[type] = ofType.map(
        (entity) => storage.rowOf(entity, { targets }) as RulesetRawData["entities"][string][number],
      );
    }
    const joins: RulesetRawData["joins"] = {};
    for (const { name } of storage.viewSchema().joins) joins[name] = storage.joinRowsOf(name, live);
    const { kindValues, values } = storage.valuesOf({ entities: live, ruleset: stored.ruleset });
    return {
      entities,
      joins,
      kindValues,
      tieredIds: stored.tieredIds,
      modifiers: stored.modifiers,
      requirements: stored.requirements,
      values,
    };
  }

  /** A ruleset's source chain: its extensions first (their new entities are visible), then its ancestors. */
  buildSourceChain(ruleset: Omit<RulesetSources, "id">): string[] {
    return CowSources.buildSourceChain(ruleset);
  }

  /**
   * A ruleset's view: its own rows and its source chain's (`chain`, its own first, then its chain's in order), composed
   * by its copy-on-write data (`cow`), with the fields every module declares: each owner's values in their order.
   */
  buildView(ruleset: { baseRules: BaseRules }, chain: RulesetRawData[], cow: CowData): RulesetData {
    const storage = StorageEngine.shared();
    return new RulesetComposition(
      chain,
      cow,
      storage.declaredFields(),
      storage.viewSchema(),
      Modules.of(ruleset.baseRules).kindLabels,
    ).build();
  }

  /**
   * The owners whose owned entities pair by position (3.5's classes, their levels by level): those the ruleset and its
   * source chain copied (their snapshots say) and their sources, and those of its own and its extensions' of a name
   * both have.
   */
  getPairedOwnerIds(rows: Pick<CowRows, "ownNamesakes" | "snapshots">) {
    return CowSources.getPairedOwnerIds(rows, CopyOnWriteEngine.kinds().owners);
  }

  /** What a ruleset's copy-on-write data is read from, each read none when it needs none. */
  getReads(ruleset: RulesetSources) {
    return CowSources.getReads(ruleset, CopyOnWriteEngine.kinds());
  }

  /**
   * What a copy of a sibling winner (of `entityType`) takes of its siblings' customizations beside its own, merged as
   * the view merges: their modifiers and requirements it lacks, and its stored values with theirs merged in.
   */
  mergeCustomizations(
    own: EntityCustomizations,
    siblings: EntityCustomizations[],
    targetEntityId: string,
    entityType: string,
  ): EntityCustomizations {
    const declared = StorageEngine.shared().declaredFields();
    return SiblingMerge.mergeCustomizations(own, siblings, targetEntityId, entityType, declared);
  }

  /** The siblings' list links the winner doesn't have, by the list `resolve` gives. */
  mergeListLinks<T extends { listId: string }>(
    own: readonly T[],
    siblings: Iterable<readonly T[]>,
    resolve: (id: string) => string,
  ): T[] {
    return SiblingMerge.mergeListLinks(own, siblings, resolve, "listId");
  }
}
