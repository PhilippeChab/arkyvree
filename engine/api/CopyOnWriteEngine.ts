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
  type CopiedSources,
  type EntityCustomizations,
  RulesetComposition,
  type RulesetData,
  type RulesetRawData,
  SiblingMerge,
  type ViewEntity,
  type ViewLink,
} from "@/engine/core/view/index.ts";
import type { BaseRules } from "@/shared/enums.ts";
import type { Modifier, NameBinding, Requirement } from "@/shared/relations.ts";

import Modules from "./Modules.ts";
import StorageEngine from "./StorageEngine.ts";

/** A ruleset's own stored rows, as the server reads them for its view (`buildRawData`). */
export interface StoredRulesetRows {
  /** What the names in its modifiers' and requirements' paths mean, as stored beside them: none read, none kept */
  bindings?: NameBinding[];
  /** Its live entities, every kind's, by name then id */
  entities: StoredEntity[];
  /** Every modifier whose source is one of its entities, every requirement of them or of those modifiers */
  modifiers: Modifier[];
  requirements: Requirement[];
  /** Its own settings, none when it holds none */
  ruleset?: StoredRuleset;
  /** Its id */
  rulesetId?: string;
  /** Of its entities, those a link with a tier points at, from any ruleset's entity (a spell list's at a level) */
  tierListIds: Set<string>;
}

/**
 * The engine's copy-on-write of a base rules' rulesets (`baseRules`), which copy-on-write's views and writes ask before
 * there's a view to bind: what a ruleset's view is built from and of, by its module's storage declarations.
 */
export default class CopyOnWriteEngine {
  constructor(private readonly baseRules: BaseRules) {
    this.storage = StorageEngine.of(baseRules);
  }

  /** Its base rules' module's storage. */
  private readonly storage: StorageEngine;

  /** Refuses a ruleset's sources (`ruleset`) of other base rules than its own, whose kinds it doesn't pair by. */
  private checkSources(ruleset: Pick<RulesetSources, "baseRules">) {
    if (ruleset.baseRules !== this.baseRules)
      throw new Error(`A ruleset of ${ruleset.baseRules} is no ruleset of ${this.baseRules}`);
  }

  /** How its kinds pair in its rulesets' chains, by its module's storage declarations. */
  private kinds(): CowKinds {
    return {
      identities: this.storage.namesakeKinds("identity"),
      owned: this.storage.ownedTypes(),
      owners: this.storage.ownerKinds(),
      reprints: this.storage.namesakeKinds("reprints"),
    };
  }

  /** A ruleset's copy-on-write data, from the rows read for it (`getReads`, `getPairedOwnerIds`). */
  buildData(ruleset: RulesetSources, rows: CowRows): CowData {
    this.checkSources(ruleset);
    return CowDataBuilder.build(ruleset, rows);
  }

  /**
   * A ruleset's own rows as its view composes them, off its stored rows (`stored`, read by its module's storage): each
   * kind's entities by its type, each its record (`StorageEngine.recordOf`: its own columns, its fields, its single
   * links), an owned kind's by position and owner; each entity's links (`StorageEngine.viewLinksOf`); each kind's
   * values kind-wide (`StorageEngine.kindValues`), its own Settings (`StorageEngine.settingsOf`), its modifiers and
   * requirements.
   */
  buildRawData(stored: StoredRulesetRows): RulesetRawData {
    const { storage } = this;
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
      bindings: Map.groupBy(stored.bindings ?? [], (binding) => (binding.modifierId ?? binding.requirementId)!),
      ...(stored.rulesetId !== undefined && { rulesetId: stored.rulesetId }),
      entities,
      kindValues: storage.kindValues(stored.entities),
      links,
      tierListIds: stored.tierListIds,
      modifiers: stored.modifiers,
      requirements: stored.requirements,
      ...(ruleset && { settings: { rulesetId: ruleset.id, values: storage.settingsOf(ruleset) } }),
    };
  }

  /** A ruleset's source chain: its extensions first (their new entities are visible), then its parent. */
  buildSourceChain(ruleset: Omit<RulesetSources, "id">): string[] {
    this.checkSources(ruleset);
    return CowSources.buildSourceChain(ruleset);
  }

  /**
   * A ruleset's view: its own rows and its source chain's (`chain`, its own first, then its chain's in order), composed
   * by its copy-on-write data (`cow`), with the fields its module declares (each owner's values in their order) and its
   * rules' words, which its refusals and issues name a type by.
   */
  buildView(chain: RulesetRawData[], cow: CowData): RulesetData {
    return new RulesetComposition(
      chain,
      cow,
      this.storage.declaredFields(),
      this.storage.viewSchema(),
      Modules.of(this.baseRules).ruleset.describeRules().words,
      [...this.storage.namesakeKinds("identity"), ...this.storage.namesakeKinds("reprints")],
      Modules.of(this.baseRules).targetPaths,
    ).build();
  }

  /**
   * The owners whose owned entities pair by position (3.5's classes, their levels by level): those the ruleset and its
   * source chain copied (their snapshots say) and their sources, and those of its own and its extensions' of a name
   * both have, by its kinds.
   */
  getPairedOwnerIds(rows: Pick<CowRows, "ownNamesakes" | "snapshots">) {
    return CowSources.getPairedOwnerIds(rows, this.kinds().owners);
  }

  /** What a ruleset's copy-on-write data is read from, by its kinds, each read none when it needs none. */
  getReads(ruleset: RulesetSources) {
    this.checkSources(ruleset);
    return CowSources.getReads(ruleset, this.kinds());
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
    const union = this.storage.viewSchema().unionLinks.filter((link) => link.fromType === entityType);
    const merges = (link: T) => union.some(({ role, toType }) => role === link.role && toType === link.toType);
    return SiblingMerge.mergeLinks(
      own.filter(merges),
      siblings.map((links) => links.filter(merges)),
      resolve,
    );
  }

  /**
   * A sibling winner's fields and single links (`own`, of `entityType`, as stored), with its siblings' (`siblings`, in
   * the order its `CowData` pairs them) merged in as the view merges them: each field and role by its declared merge,
   * against what each copied (`sources`).
   */
  mergeValues(own: StoredValues, siblings: StoredValues[], entityType: string, sources: CopiedSources): StoredValues {
    return SiblingMerge.mergeValues(own, siblings, entityType, this.storage.declaredFields(), sources).values;
  }
}
