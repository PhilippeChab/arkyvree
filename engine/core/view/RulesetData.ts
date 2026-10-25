import type { CowData } from "@/engine/core/cow/index.ts";
import { OwnerValues, type StoredValues } from "@/engine/core/fields/index.ts";
import type { Modifier, Requirement, Ruleset } from "@/shared/relations.ts";

import type { ViewEntities, ViewJoins } from "./rows.ts";

/** Each index a ruleset's view builds on first read, and keeps. */
interface Indices {
  modifiersById: Map<string, Modifier>;
  modifiersBySource: Map<string, Modifier[]>;
  requirementsByEntity: Map<string, Requirement[]>;
}

/**
 * A value a kind's entities hold of a field, kind-wide, as text (a flag's `"true"`), and the entities that hold it, in
 * the order the view composes them (`RulesetData.kindValues`).
 */
export interface KindValue {
  entityIds: string[];
  field: string;
  value: string;
}

/** A ruleset's lists, composed across its chain (`RulesetComposition`): what its view holds and indexes. */
export interface RulesetLists {
  /** Each kind's rows, by its type */
  entities: ReadonlyMap<string, readonly object[]>;
  /** Each join's rows, by its name, but those a kind's lists nest */
  joins: ReadonlyMap<string, readonly object[]>;
  /** Each kind's values kind-wide (its type's), as stat blocks show them: built when it's first read */
  kindValuesOf(type: string): KindValue[];
  modifiers: Modifier[];
  requirements: Requirement[];
  /** The entities a link of a join with a tier points at (a spell list at a level) */
  tieredIds: Set<string>;
  /** Each owner's stored values (an entity's, a ruleset's own Settings), by its id: a sibling loser's in its winner's */
  values: ReadonlyMap<string, StoredValues>;
}

/** A ruleset as a character's build reads it: its row, and its view, composed by copy-on-write. */
export interface RulesetView {
  ruleset: Ruleset;
  rulesetData: RulesetData;
}

/**
 * What a ruleset's view knows of a kind past its rows, as its module declares it: whether a user customizes its entities
 * (`customizable`), whether they hold fields of their own (`fields`), the fields they read off another entity when they
 * hold none and the column their row names it by (`inherits`: an item's template's), and the column an owned kind's
 * row holds its position in its owner at (`position`: a class level's `level`).
 */
export interface ViewKind {
  customizable: boolean;
  fields: boolean;
  inherits?: { column: string; fields: ReadonlySet<string> };
  position?: string;
}

/** Rows by id. */
function buildById<T extends { id: string }>(list: readonly T[]): Map<string, T> {
  return new Map(list.map((item) => [item.id, item]));
}

/**
 * A ruleset's view: its lists, composed across its chain by its copy-on-write data (`RulesetComposition`), each kind's
 * and each join's by name, and their lookup indices. An index is built the first time it's read, then kept: a request
 * pays for the indices it reads, not for all of them. Every id-keyed index takes a stored (pre-COW) id too: its `.get`
 * and `.has` resolve the key (`CowData.resolve`), so consumers don't thread `cow` through or call `canonicalize` on the
 * common lookup path. What a module reads of it past its kinds' rows (3.5's indices) it derives (`derive`).
 */
export default class RulesetData {
  /**
   * `labels`: what its module calls an entity of each kind; `kinds`: what its modules declare of each kind past its rows
   * (`ViewKind`).
   */
  constructor(
    lists: RulesetLists,
    cow: CowData,
    labels: Readonly<Record<string, string>>,
    kinds: Readonly<Record<string, ViewKind>>,
  ) {
    this.labels = labels;
    this.kinds = kinds;
    this.entities = lists.entities;
    this.joins = lists.joins;
    this.kindValuesOf = (type) => lists.kindValuesOf(type);
    this.modifiers = lists.modifiers;
    this.requirements = lists.requirements;
    this.tieredIds = lists.tieredIds;
    this.values = lists.values;
    this.cow = cow;
  }

  private readonly built: Partial<Indices> = {};

  /** Each kind's rows by id, built the first time a kind's are read: as stored, and resolving a stored id. */
  private readonly byIds = new Map<string, { resolved: Map<string, object>; stored: Map<string, object> }>();

  /** What the ruleset's module derives of the view, by what derives it (`derive`). */
  private readonly derived = new Map<new (rulesetData: RulesetData) => object, object>();

  private readonly entities: ReadonlyMap<string, readonly object[]>;

  private readonly joins: ReadonlyMap<string, readonly object[]>;

  private readonly kinds: Readonly<Record<string, ViewKind>>;

  /** Each kind's values kind-wide, by its type, once read. */
  private readonly kindValuesByType = new Map<string, KindValue[]>();

  /** Each kind's values kind-wide, built on first read: what `kindValues` keeps. */
  private readonly kindValuesOf: (type: string) => KindValue[];

  private readonly labels: Readonly<Record<string, string>>;

  private readonly modifiers: Modifier[];

  private readonly requirements: Requirement[];

  /** Each owner's stored values, by its id. */
  private readonly values: ReadonlyMap<string, StoredValues>;

  /**
   * The ruleset's copy-on-write state: the id Maps resolve through it on their own; rows as stored (a character's, a
   * page's) are resolved with it (`resolveRows`), and lineage- or sibling-aware code reads it.
   */
  readonly cow: CowData;

  /** The entities a link of a join with a tier points at, from any ruleset (a spell list at a level). */
  readonly tieredIds: Set<string>;

  /** A kind's rows by id (`type`): as stored, and resolving a stored id, each built once. */
  private indexOf(type: string) {
    let byId = this.byIds.get(type);
    if (!byId) {
      const stored = buildById((this.entities.get(type) ?? []) as { id: string }[]);
      byId = { resolved: this.resolvingIds(stored), stored };
      this.byIds.set(type, byId);
    }
    return byId;
  }

  /**
   * Wraps a string-keyed Map so `.get(key)` and `.has(key)` look the key up as `resolveKey` maps it: consumers can pass
   * either a pre-COW (stored) id or a post-COW id — both land on the post-COW entity. `.size`, `.values()`,
   * `.entries()`, etc. behave normally (no alias duplication). Returns the original Map when the scope resolves no id
   * (no allocation cost).
   */
  private resolving<V>(map: Map<string, V>, resolveKey: (key: string) => string): Map<string, V> {
    if (this.cow.isEmpty()) return map;
    return new Proxy(map, {
      get(target, prop) {
        if (prop === "get") return (key: string) => target.get(resolveKey(key));

        if (prop === "has") return (key: string) => target.has(resolveKey(key));

        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }

  /** A kind's rows by id (`type`), a stored (pre-COW) id resolving to its copy's or its winner's. */
  byId<K extends keyof ViewEntities>(type: K): Map<string, ViewEntities[K]> {
    return this.indexOf(type).resolved as Map<string, ViewEntities[K]>;
  }

  /**
   * Resolve a stored (pre-COW) entity id to its post-COW form; the input unchanged if no copy stands for it. For
   * Set/array comparisons, where the id Maps' auto-resolving `.get`/`.has` doesn't apply.
   */
  canonicalize(id: string): string {
    return this.cow.resolve(id);
  }

  /** An entity's customizations, as the view composes them: its modifiers, its stored values and its requirements. */
  customizationsOf(entityId: string) {
    return {
      modifiers: this.modifiersBySource.get(entityId) ?? [],
      requirements: this.requirementsByEntity.get(entityId) ?? [],
      values: this.valuesOf(entityId),
    };
  }

  /**
   * What a ruleset's module derives of the view (an instance of `kind`, built from the view): built the first time it's
   * read, then kept with the view, as its indices are. A 3.5 character's spell lists, which every build and listing reads.
   */
  derive<T extends object>(kind: new (rulesetData: RulesetData) => T): T {
    const kept = this.derived.get(kind);
    if (kept instanceof kind) return kept;
    const derived = new kind(this);
    this.derived.set(kind, derived);
    return derived;
  }

  /**
   * Inventory entries (`entries`, each naming its item: a stored id is its copy's or its winner's), each with the item
   * the view shows for it. The view holds every item an entry names, as it does every pick's entity: deleting an item,
   * reverting it or unsubscribing from its book is refused while an entry holds it. An entry it doesn't is left out, as
   * a pick is.
   */
  entriesWithItems<E extends { itemId: string }>(entries: E[]): { entry: E; item: ViewEntities["items"] }[] {
    return entries.flatMap((entry) => {
      const item = this.byId("items").get(entry.itemId);
      return item ? [{ entry, item }] : [];
    });
  }

  /**
   * The entity of `type` an id names in the view (a stored id its copy or winner): the ruleset's own, or inherited. It
   * builds the index of `type` alone.
   */
  find<K extends keyof ViewEntities>(type: K, id: string): ViewEntities[K] | undefined {
    return this.byId(type).get(id);
  }

  /**
   * An entity's stored values (`entity`, of `type`), those it reads off another included (`ViewKind.inherits`: an item's
   * template's): each such field of the other's it holds none of, the other's first, then its own. Its own alone for a
   * kind that reads none, or an entity that names none.
   */
  inheritedValuesOf(type: string, entity: { id: string }): StoredValues {
    const own = this.valuesOf(entity.id);
    const inherits = this.kinds[type]?.inherits;
    if (!inherits) return own;
    const baseId = (entity as Record<string, unknown>)[inherits.column];
    if (typeof baseId !== "string") return own;
    return OwnerValues.inherit(own, this.valuesOf(baseId), inherits.fields);
  }

  /** Whether a user customizes a kind's entities (`type`): their modifiers and requirements. */
  isCustomizable(type: string): boolean {
    return this.kinds[type]?.customizable ?? false;
  }

  /**
   * An item's requirements, as its template splits them: its template's (`template`: its own when it's a template),
   * and its own on top of them (`own`: none on a template, all of a plain item's).
   */
  itemRequirements(item: Pick<ViewEntities["items"], "id" | "isTemplate" | "sourceItemId">) {
    const { requirementsByEntity } = this;
    const own = requirementsByEntity.get(item.id) ?? [];
    if (item.isTemplate) return { own: [], template: own };
    const template = item.sourceItemId ? (requirementsByEntity.get(item.sourceItemId) ?? []) : [];
    return { own, template };
  }

  /** A join's rows (`join`), across the chain, as the view composes them. */
  joinRows<J extends keyof ViewJoins>(join: J): ViewJoins[J][] {
    return (this.joins.get(join) ?? []) as ViewJoins[J][];
  }

  /**
   * A kind's values kind-wide (`type`'s), each value of each of its fields with the entities that hold it, as stat
   * blocks show them: by field, in their declared order, then by value, in their closed list's order, then by text; the
   * entities in the order the view composes them. Built the first time a kind's are read.
   */
  kindValues(type: string): KindValue[] {
    let values = this.kindValuesByType.get(type);
    if (!values) {
      values = this.kindValuesOf(type);
      this.kindValuesByType.set(type, values);
    }
    return values;
  }

  /**
   * What the ruleset's module calls an entity of a type (`type`), as a refusal or an issue names it ("Feat <id> does
   * not belong to this ruleset"): the type itself for one it names none of.
   */
  labelOf(type: string): string {
    return this.labels[type] ?? type;
  }

  /**
   * Modifiers by id, unresolved: only an entity's copy gets copy-on-write aliases (`EntityCopy` copies its modifiers
   * under new ids), so a modifier's own id is never stale.
   */
  get modifiersById(): Map<string, Modifier> {
    return (this.built.modifiersById ??= buildById(this.modifiers));
  }

  get modifiersBySource(): Map<string, Modifier[]> {
    return (this.built.modifiersBySource ??= this.resolvingIds(Map.groupBy(this.modifiers, (m) => m.sourceId)));
  }

  /** An owned entity's position in its owner (`entity`, of `type`: a class level's level), none of a kind none owns. */
  positionOf(type: string, entity: object): number | undefined {
    const column = this.kinds[type]?.position;
    return column === undefined ? undefined : ((entity as Record<string, number>)[column] ?? undefined);
  }

  /** entityId → its requirements (a sibling's merged into its winner's). */
  get requirementsByEntity(): Map<string, Requirement[]> {
    return (this.built.requirementsByEntity ??= this.resolvingIds(Map.groupBy(this.requirements, (r) => r.entityId)));
  }

  /**
   * A Map keyed by `${id}:${rest}` composites (an owned entity's `${ownerId}:${position}`): the id portion before the
   * first `:` resolves through `CowData.resolve`, the rest stays. So a caller passing a pre-COW id still lands on the
   * right entry.
   */
  resolvingCompositeKeys<V>(map: Map<string, V>): Map<string, V> {
    return this.resolving(map, (key) => {
      const sep = key.indexOf(":");
      if (sep === -1) return key;
      return this.cow.resolve(key.slice(0, sep)) + key.slice(sep);
    });
  }

  /** A Map keyed by entity ids, whose `.get` and `.has` take a stored (pre-COW) id. */
  resolvingIds<V>(map: Map<string, V>): Map<string, V> {
    return this.resolving(map, (key) => this.cow.resolve(key));
  }

  /** A kind's rows (`type`), across the chain, as the view composes them. */
  rows<K extends keyof ViewEntities>(type: K): ViewEntities[K][] {
    return (this.entities.get(type) ?? []) as ViewEntities[K][];
  }

  /**
   * A ruleset's own stored values (its Settings), as its chain holds them: each field's and each link's of the nearest
   * ruleset that holds it, the ruleset's own first, then its source chain's in order.
   */
  rulesetValuesOf(rulesetId: string): StoredValues {
    const fields: Record<string, StoredValues["fields"][string]> = {};
    const links: Record<string, string> = {};
    for (const id of [rulesetId, ...this.cow.sourceChain]) {
      const held = this.values.get(id);
      if (!held) continue;
      for (const [field, values] of Object.entries(held.fields)) fields[field] ??= values;
      for (const [role, toId] of Object.entries(held.links)) links[role] ??= toId;
    }
    return { fields, links };
  }

  /**
   * A kind's rows by id (`type`), as stored: a stored id isn't resolved. What a module's derived indices join rows by
   * when they hold ids as stored.
   */
  storedById<K extends keyof ViewEntities>(type: K): Map<string, ViewEntities[K]> {
    return this.indexOf(type).stored as Map<string, ViewEntities[K]>;
  }

  /** Whether a kind's entities (`type`) hold fields of their own, which their form shows and their save writes. */
  takesFields(type: string): boolean {
    return this.kinds[type]?.fields ?? false;
  }

  /**
   * An owner's stored values (an entity's, a ruleset's Settings), by its id (a stored one its copy's or its winner's,
   * which holds a sibling loser's merged in): none for one that holds none.
   */
  valuesOf(id: string): StoredValues {
    return this.values.get(this.cow.resolve(id)) ?? OwnerValues.NONE;
  }
}
