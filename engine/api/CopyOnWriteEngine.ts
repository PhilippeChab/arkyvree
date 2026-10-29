import {
  type CowData,
  CowDataBuilder,
  type CowKinds,
  type CowRows,
  CowSources,
  type RulesetSources,
} from "@/engine/core/cow/index.ts";
import type { StoredValues } from "@/engine/core/fields/index.ts";
import type { StoredEntity, StoredLink, StoredRuleset } from "@/engine/core/module/index.ts";
import {
  type EntityCustomizations,
  RulesetComposition,
  type RulesetData,
  type RulesetRawData,
  SiblingMerge,
  type ViewEntity,
  type ViewLink,
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
  /** Its own settings, none when it holds none */
  ruleset?: StoredRuleset;
  /** Of its entities, those a link with a tier points at, from any ruleset's entity (a spell list's at a level) */
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
   * A ruleset's own rows as its view composes them, off its stored rows (`stored`): each kind's entities by its type,
   * each its record (`StorageEngine.recordOf`: its own columns, its fields, its single links), an owned kind's by
   * position and owner; each entity's links (`StorageEngine.viewLinksOf`); each
   * kind's values kind-wide (`StorageEngine.kindValues`), its own Settings (`StorageEngine.settingsOf`), its modifiers
   * and requirements.
   */
  buildRawData(stored: StoredRulesetRows): RulesetRawData {
    const storage = StorageEngine.shared();
    const types = storage.registries().entityTypes;
    const entities: RulesetRawData["entities"] = {};
    for (const { ownerType, type } of types) {
      const ofType = stored.entities.filter((entity) => entity.type === type);
      if (ownerType) {
        ofType.sort(
          (a, b) => a.position! - b.position! || (a.ownerId! < b.ownerId! ? -1 : a.ownerId! > b.ownerId! ? 1 : 0),
        );
      }
      entities[type] = ofType.map((entity) => storage.recordOf(entity) as ViewEntity);
    }
    const links = new Map<string, { links: ViewLink[]; type: string }>();
    for (const entity of stored.entities) {
      const held = storage.viewLinksOf(entity);
      if (held.length > 0) links.set(entity.id, { links: held, type: entity.type });
    }
    const { ruleset } = stored;
    return {
      entities,
      kindValues: storage.kindValues(stored.entities),
      links,
      tieredIds: stored.tieredIds,
      modifiers: stored.modifiers,
      requirements: stored.requirements,
      ...(ruleset && { settings: { rulesetId: ruleset.id, values: storage.settingsOf(ruleset) } }),
    };
  }

  /** A ruleset's source chain: its extensions first (their new entities are visible), then its parent. */
  buildSourceChain(ruleset: Omit<RulesetSources, "id">): string[] {
    return CowSources.buildSourceChain(ruleset);
  }

  /**
   * A ruleset's view: its own rows and its source chain's (`chain`, its own first, then its chain's in order), composed
   * by its copy-on-write data (`cow`), with the fields every module declares (each owner's values in their order) and
   * its rules' words, which its refusals and issues name a type by.
   */
  buildView(ruleset: { baseRules: BaseRules }, chain: RulesetRawData[], cow: CowData): RulesetData {
    const storage = StorageEngine.shared();
    return new RulesetComposition(
      chain,
      cow,
      storage.declaredFields(),
      storage.viewSchema(),
      Modules.of(ruleset.baseRules).ruleset.describeRules().words,
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
   * What a copy of a sibling winner takes of its siblings' customizations beside its own, merged as the view merges:
   * their modifiers and requirements it lacks.
   */
  mergeCustomizations(
    own: EntityCustomizations,
    siblings: EntityCustomizations[],
    targetEntityId: string,
  ): EntityCustomizations {
    return SiblingMerge.mergeCustomizations(own, siblings, targetEntityId);
  }

  /**
   * What a copy of a sibling winner (of `entityType`) takes of its siblings' links beside its own, merged as the view
   * merges them: of the roles that merge (a feat's pools), their links to targets it doesn't link to, by the target
   * `resolve` gives.
   */
  mergeLinks<T extends Pick<StoredLink, "role" | "toId" | "toType">>(
    own: readonly T[],
    siblings: (readonly T[])[],
    resolve: (id: string) => string,
    entityType: string,
  ): T[] {
    const union = StorageEngine.shared()
      .viewSchema()
      .unionLinks.filter((link) => link.fromType === entityType);
    const merges = (link: T) => union.some(({ role, toType }) => role === link.role && toType === link.toType);
    return SiblingMerge.mergeLinks(
      own.filter(merges),
      siblings.map((links) => links.filter(merges)),
      resolve,
    );
  }

  /**
   * A sibling winner's fields and single links (`own`, of `entityType`, as stored), with its siblings' (`siblings`, in
   * the order its `CowData` pairs them) merged in as the view merges them: each field and role by its declared merge.
   */
  mergeValues(own: StoredValues, siblings: StoredValues[], entityType: string): StoredValues {
    return SiblingMerge.mergeValues(own, siblings, entityType, StorageEngine.shared().declaredFields()).values;
  }
}
