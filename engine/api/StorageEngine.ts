import { Decimals, DeclaredFields, type Fields, OwnerValues, type StoredValues } from "@/engine/core/fields/index.ts";
import type {
  CharacterRoleDef,
  EntityRecord,
  FieldDef,
  FieldValue,
  LinkRoleDef,
  RulesetModule,
  StepDef,
  StorageRegistries,
  StoredCharacter,
  StoredEntity,
  StoredKind,
  StoredRuleset,
} from "@/engine/core/module/index.ts";
import type { KindValue, ViewLink, ViewSchema } from "@/engine/core/view/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

import Modules from "./Modules.ts";

/** How two texts sort by their characters' codes, as the database's collation (C) orders text. */
function compareText(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The entries of every module's record (`pick`), one per name: a name two modules declare is refused. */
function mergeRecords<T>(modules: [BaseRules, RulesetModule][], pick: (module: RulesetModule) => Record<string, T>) {
  const merged: Record<string, T> = {};
  for (const [baseRules, module] of modules) {
    for (const [name, value] of Object.entries(pick(module))) {
      if (name in merged) throw new Error(`${baseRules} declares ${name}, which another module stores`);
      merged[name] = value;
    }
  }
  return merged;
}

/**
 * How every registered module stores its data in the generic tables, which the server reads and writes them by: each
 * kind (`kind`: its own fields, its defaults), what an entity's record reads of its fields and links (`recordReads`), an
 * entity's links as a view holds them (`viewLinksOf`), a character's (`character`), each field and link role (`field`,
 * `role`), and the registries' rows (`registries`). Names are global: two modules declaring one kind, field or role is
 * refused, as the registries' keys refuse it.
 */
export default class StorageEngine {
  constructor(modules: [BaseRules, RulesetModule][]) {
    this.baseRules = modules.map(([baseRules]) => baseRules);
    this.kinds = mergeRecords(modules, (module) => module.storage.kinds);
    this.fields = mergeRecords(modules, (module) => module.fields);
    this.characterDeclaration = {
      scoredRoles: modules.flatMap(([, module]) => module.storage.character.scoredRoles),
    };
    const registries = modules.map(([, module]) => module.storage.registries);
    this.merged = {
      entityTypes: registries.flatMap((registry) => registry.entityTypes),
      linkRoles: registries.flatMap((registry) => registry.linkRoles),
      fieldDefs: registries.flatMap((registry) => registry.fieldDefs),
      rulesetRoles: registries.flatMap((registry) => registry.rulesetRoles),
      characterRoles: registries.flatMap((registry) => registry.characterRoles),
      steps: registries.flatMap((registry) => registry.steps),
      itemTypes: registries.flatMap((registry) => registry.itemTypes),
    };
    StorageEngine.checkDeclarations(this.merged);
  }

  /** Every module's storage, merged once: the modules never change. */
  private static instance: StorageEngine | undefined;

  /**
   * Refuses a field or a link role whose merge or inheritance the engine can't read: a union of what isn't a set (a
   * single field's values, a single link), or a field read off another but an entity's, or through a role that isn't
   * single from its type to its type (an item's template).
   */
  private static checkDeclarations({ fieldDefs, linkRoles }: StorageRegistries) {
    for (const role of linkRoles) {
      if (role.single && role.merge === "union") {
        throw new Error(
          `The link role ${role.role} from ${role.fromType} is single: its sibling copies can't union it`,
        );
      }
    }
    for (const def of fieldDefs) {
      const name = `The field ${def.field} of ${def.ownerType}`;
      if (!def.multiple && def.merge === "union")
        throw new Error(`${name} holds one value: its sibling copies can't union it`);
      if (def.inheritsVia === null) continue;
      const via = linkRoles.find(
        (role) => role.role === def.inheritsVia && role.fromType === def.ownerType && role.toType === def.ownerType,
      );
      if (def.ownerKind !== "entity" || !via?.single)
        throw new Error(`${name} is read off another through ${def.inheritsVia}, no single role from its type to it`);
    }
  }

  /**
   * A kind's values kind-wide off its owners' written values (`rows`, each as text): each field's value, with the
   * entities that hold it in the order they were written, then by id.
   */
  private static kindValuesOf(rows: { createdAt: string; field: string; ownerId: string; value: string }[]) {
    rows.sort(
      (a, b) =>
        compareText(a.createdAt, b.createdAt) ||
        compareText(a.ownerId, b.ownerId) ||
        compareText(a.field, b.field) ||
        compareText(a.value, b.value),
    );
    const byValue = new Map<string, KindValue>();
    for (const { field, ownerId, value } of rows) {
      const key = `${field}\u0000${value}`;
      const held = byValue.get(key);
      if (held) held.entityIds.push(ownerId);
      else byValue.set(key, { entityIds: [ownerId], field, value });
    }
    return [...byValue.values()];
  }

  /** Every registered module's storage, merged: one instance, built on its first read. */
  static shared(): StorageEngine {
    StorageEngine.instance ??= new StorageEngine(Modules.all());
    return StorageEngine.instance;
  }

  private readonly baseRules: BaseRules[];

  private readonly characterDeclaration: StoredCharacter;

  /** Every module's owners' fields, by owner type. */
  private readonly fields: Record<string, Fields>;

  private readonly kinds: Record<string, StoredKind>;

  private readonly merged: StorageRegistries;

  /** The single links each type's record reads, by its type, once read (`recordRoles`). */
  private readonly recordRolesByType = new Map<string, readonly string[]>();

  /** The fields every module declares, as views keep their values, once read (`declaredFields`). */
  private declared?: DeclaredFields;

  /** Every kind's own fields, once read (`ownFieldNames`). */
  private ownFields?: Set<string>;

  /** What an entity's record reads of its fields and links, every kind's, once read (`recordReads`). */
  private reads?: { fields: string[]; roles: string[] };

  /** What every module declares of a view's kinds and links, once read (`viewSchema`). */
  private schema?: ViewSchema;

  /** The roles of the links a view holds of an entity, by its type, once read (`viewLinksOf`). */
  private viewRoles?: Map<string, Set<string>>;

  /** The fields every kind holds of its own (`StoredKind.fields`), which its entities' records read: no stored value. */
  private ownFieldNames(): Set<string> {
    this.ownFields ??= new Set(Object.values(this.kinds).flatMap((kind) => Object.keys(kind.fields ?? {})));
    return this.ownFields;
  }

  /**
   * The single links of a type (`type`) its record reads, by role: each its role's, but those its fields read, which
   * its stored values hold.
   */
  private recordRoles(type: string): readonly string[] {
    let roles = this.recordRolesByType.get(type);
    if (!roles) {
      const read = this.declaredFields().fieldRoles(type);
      roles = this.merged.linkRoles
        .filter((def) => def.fromType === type && def.single && !read.includes(def.role))
        .map((def) => def.role);
      this.recordRolesByType.set(type, roles);
    }
    return roles;
  }

  /** A character's data, as every module stores it past its registries: the roles of its links that hold an amount. */
  character(): StoredCharacter {
    return this.characterDeclaration;
  }

  /** A character's link role (3.5's `race`, `score`, `speaks`): the type of its entities, and whether it holds one. */
  characterRole(role: string): CharacterRoleDef {
    const found = this.merged.characterRoles.find((def) => def.role === role);
    if (!found) throw new Error(`No module declares the character role ${role}`);
    return found;
  }

  /** The kinds a user customizes (`StoredKind.customizable`: 3.5's feats, items, spells, races, classes and levels). */
  customizableKinds(): string[] {
    return Object.keys(this.kinds).filter((type) => this.kinds[type].customizable);
  }

  /** The fields every module declares, as a ruleset's view keeps their values (`DeclaredFields`): built once. */
  declaredFields(): DeclaredFields {
    this.declared ??= new DeclaredFields(this.fields, this.merged);
    return this.declared;
  }

  /**
   * What a new entity of a kind (`type`) is written with where its write gives none: its own fields' defaults, and its
   * partition.
   */
  defaultsOf(type: string): { fields: Record<string, FieldValue>; partition: string } {
    const kind = this.kind(type);
    return {
      fields: Object.fromEntries(
        Object.entries(kind.fields ?? {}).flatMap(([field, { default: value }]) =>
          value === undefined ? [] : [[field, value]],
        ),
      ),
      partition: kind.partition ?? "",
    };
  }

  /**
   * The roles whose links an entity's page edits one at a time (`StoredKind.editedLinks`: 3.5's class's skills), each
   * with the kinds its links are from and to: what names their activities.
   */
  editedLinks(): Map<string, { from: string; to: string }> {
    return new Map(
      Object.entries(this.kinds).flatMap(([type, kind]) => {
        if (!kind.editedLinks) return [];
        const role = kind.editedLinks;
        const [def, ...others] = this.merged.linkRoles.filter((held) => held.role === role && held.fromType === type);
        if (!def || others.length > 0) throw new Error(`The kind ${type} edits its ${role} links to no one kind`);
        return [[role, { from: type, to: def.toType }]];
      }),
    );
  }

  /** A field of an owner's type (an entity type, `rulesets` or `characters`), if a module declares it. */
  field(ownerType: string, field: string): FieldDef | undefined {
    return this.merged.fieldDefs.find((def) => def.ownerType === ownerType && def.field === field);
  }

  /**
   * The types whose owners hold fields past their kind's own, which their form shows and their save writes, as
   * their modules declare them: kinds' (3.5's feats, items, spells, races, classes, class levels and skills) and the
   * rulesets' (their settings).
   */
  fieldOwners(): string[] {
    return Object.keys(this.fields);
  }

  /** An entity kind, by its type (`feats`): its own fields, its defaults, how its entities pair. */
  kind(type: string): StoredKind {
    const kind = this.kinds[type];
    if (!kind) throw new Error(`No module stores the kind ${type}`);
    return kind;
  }

  /** The base rules of every registered module: what a ruleset's `base_rules` may name (`rules.modules`). */
  modules(): BaseRules[] {
    return this.baseRules;
  }

  /** The kinds whose entities of one name in a ruleset's chain pair as `pairing` says (`StoredKind.namesakes`). */
  namesakeKinds(pairing: NonNullable<StoredKind["namesakes"]>): string[] {
    return Object.keys(this.kinds).filter((type) => this.kinds[type].namesakes === pairing);
  }

  /** The kinds a kind owns (`type`: a class's levels), whose entities go with its own. */
  ownedKinds(type: string): string[] {
    return this.merged.entityTypes.filter((def) => def.ownerType === type).map((def) => def.type);
  }

  /** The kinds another owns (3.5's class levels), in their declarations' order. */
  ownedTypes(): string[] {
    return this.merged.entityTypes.flatMap((def) => (def.ownerType ? [def.type] : []));
  }

  /** The kinds that own another (3.5's classes, their levels'), in the order their owned kinds are declared. */
  ownerKinds(): string[] {
    return [...new Set(this.merged.entityTypes.flatMap((def) => (def.ownerType ? [def.ownerType] : [])))];
  }

  /**
   * A stored entity as its record (`EntityRecord`): its own columns, its own fields' values by field, and its single
   * links' targets by role, but those its fields read.
   */
  recordOf(entity: StoredEntity): EntityRecord {
    const { fields, links, ...own } = entity;
    const kind = this.kind(entity.type);
    const roles = this.recordRoles(entity.type);
    return {
      ...own,
      fields: Object.fromEntries(
        fields.flatMap(({ field, ordinal, value }) => (ordinal === 0 && kind.fields?.[field] ? [[field, value]] : [])),
      ),
      links: Object.fromEntries(links.flatMap(({ role, toId }) => (roles.includes(role) ? [[role, toId]] : []))),
    };
  }

  /**
   * What an entity's record reads of its fields and links, every kind's (`EntityRecord`): its own fields
   * (`StoredKind.fields`, their single value, ordinal 0), and the roles of its single links but those its fields read.
   * A read of records alone reads no more (an owner's stored values, `valuesOf`'s; its links of a role it holds many
   * of, `viewLinksOf`'s).
   */
  recordReads(): { fields: string[]; roles: string[] } {
    this.reads ??= {
      fields: [...this.ownFieldNames()],
      roles: [...new Set(this.merged.entityTypes.flatMap(({ type }) => this.recordRoles(type)))],
    };
    return this.reads;
  }

  /**
   * The roles of the links an entity holds many of that refuse their target's delete, to a kind (`type`): a class
   * level's base bonus to a save. An entity one links to is in use.
   */
  refusingRoles(type: string): string[] {
    return [
      ...new Set(
        this.merged.linkRoles
          .filter((def) => def.toType === type && !def.single && def.onDelete === "refuse")
          .map((def) => def.role),
      ),
    ];
  }

  /** What every module's registries hold. */
  registries(): StorageRegistries {
    return this.merged;
  }

  /** A link role, from a type to another. */
  role(role: string, fromType: string, toType: string): LinkRoleDef {
    const found = this.merged.linkRoles.find(
      (def) => def.role === role && def.fromType === fromType && def.toType === toType,
    );
    if (!found) throw new Error(`No module declares the role ${role} from ${fromType} to ${toType}`);
    return found;
  }

  /** An advancement's step. */
  step(step: string): StepDef {
    const found = this.merged.steps.find((def) => def.step === step);
    if (!found) throw new Error(`No module declares the step ${step}`);
    return found;
  }

  /**
   * A number an entity of a kind (`type`) holds of a field, as it's stored: refused unless it's a finite number, and
   * kept to the places its kind's own field says (`scale`), whatever writes it (a form, a seed, a copy, an import).
   */
  storedNumber(type: string, field: string, value: unknown): string {
    if (typeof value !== "number" || !Number.isFinite(value))
      throw new Error(`The field ${field} of ${type} holds a number, not ${String(value)}`);
    const scale = this.kinds[type]?.fields?.[field]?.scale;
    return String(scale === undefined ? value : Decimals.toPlaces(value, scale));
  }

  /**
   * An owner's stored values (of `type`), off its fields but its kind's own (`fields`) and its links (`links`):
   * each field's values, a set's in its declared order, its fields in theirs, and the links its type's fields read, by
   * role. None (`OwnerValues.NONE`) when it holds none.
   */
  storedValuesOf(
    type: string,
    fields: readonly { field: string; value: FieldValue }[],
    links: readonly { role: string; toId: string }[],
  ): StoredValues {
    const declared = this.declaredFields();
    const roles = declared.fieldRoles(type);
    if (fields.length === 0 && (roles.length === 0 || links.length === 0)) return OwnerValues.NONE;
    const byField = new Map<string, FieldValue[]>();
    for (const { field, value } of fields) {
      const held = byField.get(field);
      if (held) held.push(value);
      else byField.set(field, [value]);
    }
    const stored: StoredValues = {
      fields: Object.fromEntries(
        [...byField.keys()]
          .toSorted((a, b) => declared.compareFields(a, b))
          .map((field) => {
            const values = byField.get(field)!;
            return [field, values.length > 1 ? declared.orderValues(field, values) : values];
          }),
      ),
      links: Object.fromEntries(
        roles.flatMap((role) => {
          const link = links.find((held) => held.role === role);
          return link ? [[role, link.toId]] : [];
        }),
      ),
    };
    return Object.keys(stored.fields).length > 0 || Object.keys(stored.links).length > 0 ? stored : OwnerValues.NONE;
  }

  /**
   * The stored values of a ruleset's own owners (`owners`: its entities, and itself for its Settings), as its view
   * composes them: each owner's, by its type then its id (`values`), its fields but its kind's own (a ruleset's all of
   * them), each set's values and the fields themselves in their declared order (`DeclaredFields`), and the
   * links its kind's fields read, by role; an owner that holds none is left out. And each kind's values kind-wide
   * (`kindValues`), each with the entities that hold it, in the order those values were written.
   */
  valuesOf(owners: { entities: StoredEntity[]; ruleset?: StoredRuleset }): {
    kindValues: Map<string, KindValue[]>;
    values: Map<string, Map<string, StoredValues>>;
  } {
    const ownFields = this.ownFieldNames();
    const values = new Map<string, Map<string, StoredValues>>();
    const written = new Map<string, { createdAt: string; field: string; ownerId: string; value: string }[]>();
    for (const entity of owners.entities) {
      const fields = entity.fields.filter((field) => !ownFields.has(field.field));
      const stored = this.storedValuesOf(entity.type, fields, entity.links);
      if (stored !== OwnerValues.NONE)
        (values.get(entity.type) ?? values.set(entity.type, new Map()).get(entity.type)!).set(entity.id, stored);
      const rows = written.get(entity.type) ?? written.set(entity.type, []).get(entity.type)!;
      for (const { createdAt, field, value } of fields)
        rows.push({ createdAt, field, ownerId: entity.id, value: String(value) });
    }
    const { ruleset } = owners;
    const settings = ruleset && this.storedValuesOf("rulesets", ruleset.fields, ruleset.links);
    if (settings && settings !== OwnerValues.NONE) values.set("rulesets", new Map([[ruleset.id, settings]]));
    const kindValues = new Map([...written].map(([type, rows]) => [type, StorageEngine.kindValuesOf(rows)]));
    return { kindValues, values };
  }

  /**
   * An entity's links (`entity`, as stored: a feat's pools, a class level's grants, an item's template), as a view holds
   * them, in their order: as they were made, then by their ordinal and their target. Those its fields read are its
   * stored values' (`storedValuesOf`).
   */
  viewLinksOf(entity: Pick<StoredEntity, "id" | "links" | "type">): ViewLink[] {
    this.viewRoles ??= new Map(
      this.merged.entityTypes.map(({ type }) => {
        const read = this.declaredFields().fieldRoles(type);
        const roles = this.merged.linkRoles.filter((def) => def.fromType === type && !read.includes(def.role));
        return [type, new Set(roles.map((def) => def.role))];
      }),
    );
    const roles = this.viewRoles.get(entity.type);
    if (!roles) return [];
    return entity.links
      .filter((link) => roles.has(link.role))
      .sort((a, b) => compareText(a.createdAt, b.createdAt) || a.ordinal - b.ordinal || compareText(a.toId, b.toId))
      .map(({ amount, free, id, ordinal, role, tier, toId, toType, viaId }) => ({
        id,
        role,
        fromId: entity.id,
        toId,
        toType,
        viaId,
        tier,
        amount,
        free,
        ordinal,
      }));
  }

  /**
   * What a ruleset's view is composed by, of every module's declaration (`ViewSchema`): each kind's owner and what it
   * inherits, and the links whose sibling copies' merge into their winner's (`unionLinks`: a feat's pools). Read once.
   */
  viewSchema(): ViewSchema {
    if (this.schema) return this.schema;
    const types = this.merged.entityTypes;
    const ownerOf = new Map(types.map(({ ownerType, type }) => [type, ownerType]));
    const depth = (type: string): number => {
      const owner = ownerOf.get(type);
      return owner ? depth(owner) + 1 : 0;
    };
    const tracked = new Set(types.flatMap(({ ownerType }) => (ownerType ? [ownerType] : [])));
    const fields = new Set(this.fieldOwners());
    this.schema = {
      // An owner before the kinds it owns, each in its declared order otherwise
      kinds: types
        .toSorted((a, b) => depth(a.type) - depth(b.type))
        .map(({ ownerType, type }) => {
          const inherits = this.declaredFields().inheritance(type);
          const { customizable = false, template } = this.kind(type);
          return {
            type,
            customizable,
            fields: fields.has(type),
            ...(inherits && { inherits }),
            ...(ownerType && { ownerType }),
            ...(template && { template }),
            tracked: tracked.has(type),
          };
        }),
      unionLinks: this.merged.linkRoles
        .filter((def) => !def.single && def.merge === "union")
        .map(({ fromType, role, toType }) => ({ fromType, role, toType })),
    };
    return this.schema;
  }
}
