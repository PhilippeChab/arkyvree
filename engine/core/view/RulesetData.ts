import type { CowData } from "@/engine/core/cow/index.ts";
import { PropertyOrder, type PropertyTypesProvider } from "@/engine/core/customizations/index.ts";
import type { Modifier, Property, Requirement, Ruleset } from "@/shared/relations.ts";

import type { ViewEntities, ViewJoins } from "./rows.ts";

/** Each index a ruleset's view builds on first read, and keeps. */
interface Indices {
  entityIdsByProperty: Map<string, string[]>;
  modifiersById: Map<string, Modifier>;
  modifiersBySource: Map<string, Modifier[]>;
  propertiesByEntity: Map<string, Property[]>;
  propertiesByEntityType: Map<string, Property[]>;
  requirementsByEntity: Map<string, Requirement[]>;
  /** Properties as stat blocks show them */
  sortedProperties: Property[];
}

/** A ruleset's lists, composed across its chain (`RulesetComposition`): what its view holds and indexes. */
export interface RulesetLists {
  /** Each kind's rows, by its type */
  entities: ReadonlyMap<string, readonly object[]>;
  /** Each join's rows, by its name, but those a kind's lists nest */
  joins: ReadonlyMap<string, readonly object[]>;
  modifiers: Modifier[];
  properties: Property[];
  requirements: Requirement[];
  /** The entities a link of a join with a tier points at (a spell list at a level) */
  tieredIds: Set<string>;
}

/** A ruleset as a character's build reads it: its row, and its view, composed by copy-on-write. */
export interface RulesetView {
  ruleset: Ruleset;
  rulesetData: RulesetData;
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
   * `propertyTypes`: the ruleset's property types, as its rules read them, which order its entities' properties;
   * `labels`: what its module calls an entity of each kind; `positions`: the column an owned kind's row holds its
   * position in its owner at (a class level's `level`), by its kind.
   */
  constructor(
    lists: RulesetLists,
    cow: CowData,
    propertyTypes: PropertyTypesProvider,
    labels: Readonly<Record<string, string>>,
    positions: Readonly<Record<string, string>> = {},
  ) {
    this.labels = labels;
    this.positions = positions;
    this.entities = lists.entities;
    this.joins = lists.joins;
    this.modifiers = lists.modifiers;
    this.properties = lists.properties;
    this.requirements = lists.requirements;
    this.tieredIds = lists.tieredIds;
    this.cow = cow;
    this.propertyOrder = new PropertyOrder(propertyTypes);
  }

  private readonly built: Partial<Indices> = {};

  /** Each kind's rows by id, built the first time a kind's are read: as stored, and resolving a stored id. */
  private readonly byIds = new Map<string, { resolved: Map<string, object>; stored: Map<string, object> }>();

  /** What the ruleset's module derives of the view, by what derives it (`derive`). */
  private readonly derived = new Map<new (rulesetData: RulesetData) => object, object>();

  private readonly entities: ReadonlyMap<string, readonly object[]>;

  private readonly joins: ReadonlyMap<string, readonly object[]>;

  private readonly labels: Readonly<Record<string, string>>;

  private readonly modifiers: Modifier[];

  private readonly positions: Readonly<Record<string, string>>;

  private readonly properties: Property[];

  private readonly propertyOrder: PropertyOrder;

  private readonly requirements: Requirement[];

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

  /** Each entity's properties as its stat block shows them, whoever reads them. */
  private get sortedProperties(): Property[] {
    return (this.built.sortedProperties ??= this.propertyOrder.sort(this.properties));
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

  /** An entity's customizations, as the view composes them: its modifiers, its properties and its requirements. */
  customizationsOf(entityId: string) {
    return {
      modifiers: this.modifiersBySource.get(entityId) ?? [],
      properties: this.propertiesByEntity.get(entityId) ?? [],
      requirements: this.requirementsByEntity.get(entityId) ?? [],
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
   * Reverse property index: `${entityType}:${type}:${value}` → the ids of the entities with that property. Replaces
   * O(N) scans of a kind's entities' properties for one value.
   */
  get entityIdsByProperty(): Map<string, string[]> {
    return (this.built.entityIdsByProperty ??= new Map(
      [...Map.groupBy(this.sortedProperties, (p) => `${p.entityType}:${p.type}:${p.value}`)].map(([key, rows]) => [
        key,
        rows.map((p) => p.entityId),
      ]),
    ));
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
   * An item's properties: its template's of each type the item doesn't set, then its own. An item made from a
   * template (`sourceItemId`) holds only what it overrides, a type at a time: its own damage types replace all the
   * template's.
   */
  itemProperties(item: Pick<ViewEntities["items"], "id" | "sourceItemId">): Property[] {
    const { propertiesByEntity } = this;
    const own = propertiesByEntity.get(item.id) ?? [];
    if (!item.sourceItemId) return [...own];
    const ownTypes = new Set(own.map((property) => property.type));
    const template = propertiesByEntity.get(item.sourceItemId) ?? [];
    return [...template.filter((property) => !ownTypes.has(property.type)), ...own];
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
    const column = this.positions[type];
    return column === undefined ? undefined : ((entity as Record<string, number>)[column] ?? undefined);
  }

  get propertiesByEntity(): Map<string, Property[]> {
    return (this.built.propertiesByEntity ??= this.resolvingIds(Map.groupBy(this.sortedProperties, (p) => p.entityId)));
  }

  /** entityType → its properties across the chain (every entity's of a kind): what TargetPaths groups properties by. */
  get propertiesByEntityType(): Map<string, Property[]> {
    return (this.built.propertiesByEntityType ??= Map.groupBy(this.sortedProperties, (p) => p.entityType));
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
   * A ruleset's own properties (its Settings), as its chain holds them: each type's of the nearest ruleset that holds
   * it, the ruleset's own first, then its source chain's in order. The view sorts every property by its value, so its
   * rows by entity type mix the chain's: a fork's saved setting would read after its source's otherwise.
   */
  rulesetPropertiesOf(rulesetId: string): Property[] {
    const held = new Set<string>();
    return [rulesetId, ...this.cow.sourceChain].flatMap((id) => {
      const rows = (this.propertiesByEntity.get(id) ?? []).filter(
        (row) => row.entityType === "rulesets" && !held.has(row.type),
      );
      for (const row of rows) held.add(row.type);
      return rows;
    });
  }

  /**
   * A kind's rows by id (`type`), as stored: a stored id isn't resolved. What a module's derived indices join rows by
   * when they hold ids as stored.
   */
  storedById<K extends keyof ViewEntities>(type: K): Map<string, ViewEntities[K]> {
    return this.indexOf(type).stored as Map<string, ViewEntities[K]>;
  }
}
