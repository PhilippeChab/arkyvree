import type { CowData } from "@/engine/core/cow/index.ts";
import { OwnerValues, type StoredValues } from "@/engine/core/fields/index.ts";
import type { OwnerFields, RulesDescription } from "@/engine/core/module/index.ts";
import type { Modifier, Requirement, Ruleset } from "@/shared/relations.ts";

import type { InventoryItem, NamedLink, ViewEntity, ViewKinds, ViewLink } from "./rows.ts";

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
  /** Each ruleset's of its chain own Settings (its fields and its links), by its id: one that holds none left out */
  settings: ReadonlyMap<string, StoredValues>;
  /** The entities a link with a tier points at (a spell list at a level) */
  tieredIds: Set<string>;
}

/** A ruleset as a character's build reads it: its row, and its view, composed by copy-on-write. */
export interface RulesetView {
  ruleset: Ruleset;
  rulesetData: RulesetData;
}

/**
 * What a ruleset's view knows of a kind past its entities, as its module declares it: whether a user customizes its
 * entities (`customizable`), the fields they read off another entity when they hold none and the role of their link
 * to it (`inherits`: an item's template's), whether a character's inventory holds its entities (`inventory`: 3.5's
 * items), and the flag of its own that makes one of its entities a template others are made from (`template`: 3.5's
 * item's).
 */
export interface ViewKind {
  customizable: boolean;
  inherits?: { fields: ReadonlySet<string>; role: string };
  inventory?: true;
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
   * `words`: its rules' word for each type, which its refusals and issues name a type by; `kinds`: what its modules
   * declare of each kind past its rows (`ViewKind`).
   */
  constructor(
    lists: RulesetLists,
    cow: CowData,
    words: RulesDescription["words"],
    kinds: Readonly<Record<string, ViewKind>>,
  ) {
    this.words = words;
    this.kinds = kinds;
    this.entities = lists.entities;
    this.kindValuesOf = (type) => lists.kindValuesOf(type);
    this.composeLinksOf = (entityId) => lists.linksOf(entityId);
    this.modifiers = lists.modifiers;
    this.requirements = lists.requirements;
    this.tieredIds = lists.tieredIds;
    this.settings = lists.settings;
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

  /** Each entity's links, by its id (the one the view shows), once read. */
  private readonly linksById = new Map<string, readonly ViewLink[]>();

  private readonly modifiers: Modifier[];

  private readonly requirements: Requirement[];

  /** Each ruleset's of its chain own Settings, by its id. */
  private readonly settings: ReadonlyMap<string, StoredValues>;

  /** Its rules' word for each type */
  private readonly words: RulesDescription["words"];

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
   * the view shows for it (`findItem`). The view holds every item an entry names, as it does every pick's entity:
   * deleting an item, reverting it or unsubscribing from its book is refused while an entry holds it. An entry it
   * doesn't is left out, as a pick is.
   */
  entriesWithItems<E extends { itemId: string }>(entries: E[]): { entry: E; item: InventoryItem }[] {
    return entries.flatMap((entry) => {
      const item = this.findItem(entry.itemId);
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
   * The entity of a kind a character's inventory holds (`inventoryTypes`) an id names in the view (a stored id its copy
   * or winner): the ruleset's own, or inherited.
   */
  findItem(id: string): InventoryItem | undefined {
    for (const type of this.inventoryTypes()) {
      const item = this.indexOf(type).resolved.get(id);
      if (item) return item as InventoryItem;
    }
    return undefined;
  }

  /**
   * The entity another of a kind (`entity`, of `type`) reads its fields off when it holds none (`ViewKind.inherits`: an
   * item's template), by its link: none for a kind that reads none, or an entity that names none.
   */
  inheritedFrom(type: string, entity: Pick<ViewEntity, "links">): string | undefined {
    const inherits = this.kinds[type]?.inherits;
    return inherits && entity.links[inherits.role];
  }

  /** The kinds a character's inventory holds (`ViewKind.inventory`: 3.5's items), in their declared order. */
  inventoryTypes(): string[] {
    return Object.keys(this.kinds).filter((type) => this.isInventoryType(type));
  }

  /** Whether a user customizes a kind's entities (`type`): their modifiers and requirements. */
  isCustomizable(type: string): boolean {
    return this.kinds[type]?.customizable ?? false;
  }

  /** Whether a character's inventory holds a kind's entities (`type`, `ViewKind.inventory`: 3.5's items). */
  isInventoryType(type: string): boolean {
    return this.kinds[type]?.inventory ?? false;
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
   * What the ruleset's rules call an entity of a type (`type`), as a refusal or an issue names it, in a sentence's
   * case, as the client writes a word in a message ("Class level not found in this ruleset", of 3.5's "Class Level";
   * "Feat <id> does not belong to this ruleset"): the type itself for one they have no word for.
   */
  labelOf(type: string): string {
    const one = this.words[type]?.one;
    return one ? `${one.charAt(0)}${one.slice(1).toLowerCase()}` : type;
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

  /**
   * An owned entity of a type (`type`) as its position along its owner names it (`position`), in its rules' word (3.5's
   * class level's "Level 3"): its type's own word for a type they give no position word.
   */
  positionNameOf(type: string, position: number): string {
    const word = this.words[type];
    return `${word?.position?.one ?? word?.one ?? type} ${position}`;
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
   * A ruleset's own Settings, as its chain holds them: each field's and each link's of the nearest ruleset that holds
   * it, the ruleset's own first, then its source chain's in order.
   */
  rulesetValuesOf(rulesetId: string): StoredValues {
    const fields: Record<string, OwnerFields[string]> = {};
    const links: Partial<Record<string, string>> = {};
    for (const id of [rulesetId, ...this.cow.sourceChain]) {
      const held = this.settings.get(id);
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

  /**
   * An entity's requirements (`entity`, of `type`), as its template splits them (`ViewKind.template`, and the entity it
   * reads its fields off, `inheritedFrom`: an item's): its template's (`template`: its own when it's one), and its own on
   * top of them (`own`: none on a template, all of an entity made from none).
   */
  templateRequirements(type: string, entity: Pick<ViewEntity, "fields" | "id" | "links">) {
    const { requirementsByEntity } = this;
    const own = requirementsByEntity.get(entity.id) ?? [];
    if (this.isTemplate(type, entity)) return { own: [], template: own };
    const templateId = this.inheritedFrom(type, entity);
    const template = templateId ? (requirementsByEntity.get(templateId) ?? []) : [];
    return { own, template };
  }

  /**
   * An entity (`entity`, of `type`) with the fields it reads off another when it holds none (`ViewKind.inherits`: an
   * item's, its template's): each such field of the other's it holds none of, the other's first, then its own. As it is
   * for a kind that reads none, or an entity that names none.
   */
  withInheritedFields<T extends Pick<ViewEntity, "fields" | "links">>(type: string, entity: T): T {
    const baseId = this.inheritedFrom(type, entity);
    const base =
      baseId === undefined ? undefined : (this.find(type as keyof ViewKinds, baseId) as ViewEntity | undefined);
    if (!base) return entity;
    return { ...entity, fields: OwnerValues.inherit(entity.fields, base.fields, this.kinds[type].inherits!.fields) };
  }
}
