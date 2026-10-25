import type { CowData } from "@/engine/core/cow/index.ts";
import { OwnerValues, type StoredValues } from "@/engine/core/fields/index.ts";
import type { Modifier, Requirement, Ruleset } from "@/shared/relations.ts";

import type { NamedLink, ViewEntity, ViewKinds, ViewLink } from "./rows.ts";

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
  /** Each kind's entities, by its type */
  entities: ReadonlyMap<string, readonly ViewEntity[]>;
  /** Each kind's values kind-wide (its type's), as stat blocks show them: built when it's first read */
  kindValuesOf(type: string): KindValue[];
  /** An entity's links (`entityId`, one the view shows), as the view composes them: built when they're first read */
  linksOf(entityId: string): readonly ViewLink[];
  modifiers: Modifier[];
  requirements: Requirement[];
  /** The entities a link with a tier points at (a spell list at a level) */
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
 * What a ruleset's view knows of a kind past its entities, as its module declares it: whether a user customizes its
 * entities (`customizable`), whether they hold fields of their own (`fields`), the fields they read off another entity
 * when they hold none and the role of their link to it (`inherits`: an item's template's), and the flag of its own
 * that makes one of its entities a template others are made from (`template`: 3.5's item's).
 */
export interface ViewKind {
  customizable: boolean;
  fields: boolean;
  inherits?: { fields: ReadonlySet<string>; role: string };
  template?: string;
}

/** Rows by id. */
function buildById<T extends { id: string }>(list: readonly T[]): Map<string, T> {
  return new Map(list.map((item) => [item.id, item]));
}

/**
 * A ruleset's view: its lists, composed across its chain by its copy-on-write data (`RulesetComposition`), each kind's
 * by name, each entity's links by role (`linksOf`), and their lookup indices. An index is built the first time it's
 * read, then kept: a request pays for the indices it reads, not for all of them. Every id-keyed index takes a stored
 * (pre-COW) id too: its `.get` and `.has` resolve the key (`CowData.resolve`), so consumers don't thread `cow` through
 * or call `canonicalize` on the common lookup path. What a module reads of it past its kinds' rows (3.5's indices) it
 * derives (`derive`).
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
    this.kindValuesOf = (type) => lists.kindValuesOf(type);
    this.composeLinksOf = (entityId) => lists.linksOf(entityId);
    this.modifiers = lists.modifiers;
    this.requirements = lists.requirements;
    this.tieredIds = lists.tieredIds;
    this.values = lists.values;
    this.cow = cow;
  }

  private readonly built: Partial<Indices> = {};

  /** Each kind's entities by id, built the first time a kind's are read: as stored, and resolving a stored id. */
  private readonly byIds = new Map<string, { resolved: Map<string, ViewEntity>; stored: Map<string, ViewEntity> }>();

  /** An entity's links, composed the first time they're read: what `linksOf` keeps. */
  private readonly composeLinksOf: (entityId: string) => readonly ViewLink[];

  /** What the ruleset's module derives of the view, by what derives it (`derive`). */
  private readonly derived = new Map<new (rulesetData: RulesetData) => object, object>();

  private readonly entities: ReadonlyMap<string, readonly ViewEntity[]>;

  private readonly kinds: Readonly<Record<string, ViewKind>>;

  /** Each kind's values kind-wide, by its type, once read. */
  private readonly kindValuesByType = new Map<string, KindValue[]>();

  /** Each kind's values kind-wide, built on first read: what `kindValues` keeps. */
  private readonly kindValuesOf: (type: string) => KindValue[];

  private readonly labels: Readonly<Record<string, string>>;

  /** Each entity's links, by its id (the one the view shows), once read. */
  private readonly linksById = new Map<string, readonly ViewLink[]>();

  private readonly modifiers: Modifier[];

  private readonly requirements: Requirement[];

  /** Each owner's stored values, by its id. */
  private readonly values: ReadonlyMap<string, StoredValues>;

  /**
   * The ruleset's copy-on-write state: the id Maps resolve through it on their own; ids as stored (a character's, a
   * page's) are resolved with it (`resolve`), and lineage- or sibling-aware code reads it.
   */
  readonly cow: CowData;

  /** The entities a link with a tier points at, from any ruleset (a spell list at a level). */
  readonly tieredIds: Set<string>;

  /** A kind's entities by id (`type`): as stored, and resolving a stored id, each built once. */
  private indexOf(type: string) {
    let byId = this.byIds.get(type);
    if (!byId) {
      const stored = buildById(this.entities.get(type) ?? []);
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

  /** A kind's entities by id (`type`), a stored (pre-COW) id resolving to its copy's or its winner's. */
  byId<K extends keyof ViewKinds>(type: K): Map<string, ViewKinds[K]> {
    return this.indexOf(type).resolved as Map<string, ViewKinds[K]>;
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
  entriesWithItems<E extends { itemId: string }>(entries: E[]): { entry: E; item: ViewKinds["items"] }[] {
    return entries.flatMap((entry) => {
      const item = this.byId("items").get(entry.itemId);
      return item ? [{ entry, item }] : [];
    });
  }

  /**
   * The entity of `type` an id names in the view (a stored id its copy or winner): the ruleset's own, or inherited. It
   * builds the index of `type` alone.
   */
  find<K extends keyof ViewKinds>(type: K, id: string): ViewKinds[K] | undefined {
    return this.byId(type).get(id);
  }

  /**
   * The entity another of a kind (`entity`, of `type`) reads its fields off when it holds none (`ViewKind.inherits`: an
   * item's template), by its link: none for a kind that reads none, or an entity that names none.
   */
  inheritedFrom(type: string, entity: Pick<ViewEntity, "links">): string | undefined {
    const inherits = this.kinds[type]?.inherits;
    return inherits && entity.links[inherits.role];
  }

  /**
   * An entity's stored values (`entity`, of `type`), those it reads off another included (`ViewKind.inherits`: an item's
   * template's): each such field of the other's it holds none of, the other's first, then its own. Its own alone for a
   * kind that reads none, or an entity that names none.
   */
  inheritedValuesOf(type: string, entity: Pick<ViewEntity, "id" | "links">): StoredValues {
    const own = this.valuesOf(entity.id);
    const baseId = this.inheritedFrom(type, entity);
    if (baseId === undefined) return own;
    return OwnerValues.inherit(own, this.valuesOf(baseId), this.kinds[type].inherits!.fields);
  }

  /** Whether a user customizes a kind's entities (`type`): their modifiers and requirements. */
  isCustomizable(type: string): boolean {
    return this.kinds[type]?.customizable ?? false;
  }

  /**
   * Whether an entity of a kind (`entity`, of `type`) is a template others are made from: its kind's flag
   * (`ViewKind.template`) holds.
   */
  isTemplate(type: string, entity: Pick<ViewEntity, "fields">): boolean {
    const flag = this.kinds[type]?.template;
    return flag !== undefined && entity.fields[flag] === true;
  }

  /**
   * An item's requirements, as its template splits them: its template's (`template`: its own when it's a template),
   * and its own on top of them (`own`: none on a template, all of a plain item's).
   */
  itemRequirements(item: Pick<ViewEntity, "fields" | "id" | "links">) {
    const { requirementsByEntity } = this;
    const own = requirementsByEntity.get(item.id) ?? [];
    if (this.isTemplate("items", item)) return { own: [], template: own };
    const templateId = this.inheritedFrom("items", item);
    const template = templateId ? (requirementsByEntity.get(templateId) ?? []) : [];
    return { own, template };
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
   * An entity's links (`entityId`, a stored id its copy's or its winner's) of the roles it holds many of, as the view
   * composes them, in their order (`RulesetComposition`: its sibling copies' merged in, each naming the entities that
   * stand for those it names); of a role alone when `role` says, to a kind alone when `toType` says. Composed the first
   * time they're read, then kept.
   */
  linksOf(entityId: string, role?: string, toType?: string): readonly ViewLink[] {
    const id = this.cow.resolve(entityId);
    let links = this.linksById.get(id);
    if (!links) {
      links = this.composeLinksOf(id);
      this.linksById.set(id, links);
    }
    if (role === undefined) return links;
    return links.filter((link) => link.role === role && (toType === undefined || link.toType === toType));
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

  /**
   * Links (`links`, the view's) as an answer carries them: those whose targets the view shows, each with its target's
   * name (`toName`).
   */
  nameLinks(links: readonly ViewLink[]): NamedLink[] {
    return links.flatMap((link) => {
      const target = this.find(link.toType as keyof ViewKinds, link.toId) as ViewEntity | undefined;
      return target ? [{ ...link, toName: typeof target.name === "string" ? target.name : "" }] : [];
    });
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

  /** A kind's entities (`type`), across the chain, as the view composes them. */
  rows<K extends keyof ViewKinds>(type: K): ViewKinds[K][] {
    return (this.entities.get(type) ?? []) as ViewKinds[K][];
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
   * A kind's entities by id (`type`), as stored: a stored id isn't resolved. What a module's derived indices join
   * entities by when they hold ids as stored.
   */
  storedById<K extends keyof ViewKinds>(type: K): Map<string, ViewKinds[K]> {
    return this.indexOf(type).stored as Map<string, ViewKinds[K]>;
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
