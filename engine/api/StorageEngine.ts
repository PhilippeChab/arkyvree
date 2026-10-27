import {
  Decimals,
  DeclaredFields,
  Field,
  type Fields,
  FieldWrites,
  type StoredValues,
} from "@/engine/core/fields/index.ts";
import type {
  CharacterRoleDef,
  EntityRecord,
  EntityTypeDef,
  FieldDef,
  FieldValue,
  FieldWrite,
  LinkRoleDef,
  RulesDescription,
  RulesetModule,
  StepDef,
  StorageDeclaration,
  StorageRegistries,
  StoredEntity,
  StoredKind,
  StoredRuleset,
} from "@/engine/core/module/index.ts";
import type { KindValue, ViewLink, ViewSchema } from "@/engine/core/view/index.ts";
import type { Merge } from "@/shared/customization/fields.ts";
import type { BaseRules } from "@/shared/enums.ts";

import Modules, { type EntityType } from "./Modules.ts";

/** The merges the engine composes sibling copies by (`SiblingMerge`). */
const MERGES: readonly Merge[] = ["fallback", "union", "winner"];

/** How two texts sort by their characters' codes, as the database's collation (C) orders text. */
function compareText(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Every module's owners' fields (`owned`, each module's by owner type), by owner type: an owner type two modules declare
 * is refused, but those every module's owners share (`shared`: their characters', their rulesets' Settings'), merged
 * field by field, a field two modules declare of one refused.
 */
function mergeFields(owned: ReadonlyMap<BaseRules, Record<string, Fields>>, shared: readonly string[]) {
  const merged: Record<string, Record<string, Fields[string]>> = {};
  for (const [baseRules, owners] of owned) {
    for (const [ownerType, fields] of Object.entries(owners)) {
      if (ownerType in merged && !shared.includes(ownerType))
        throw new Error(`${baseRules} declares ${ownerType}, which another module stores`);
      merged[ownerType] ??= {};
      for (const [name, field] of Object.entries(fields)) {
        if (name in merged[ownerType])
          throw new Error(`${baseRules} declares the field ${name} of ${ownerType}, which another module declares`);
        merged[ownerType][name] = field;
      }
    }
  }
  return merged as Record<string, Fields>;
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
 * kind (`kind`, a new entity's partition: `partitionOf`), an entity's record off its stored rows (`recordOf`: every
 * field it holds, `fieldsOf`, and its single links), an entity's links as a view holds them (`viewLinksOf`), a number as
 * its field keeps it (`storedNumber`), a player character's kind (`playerKinds`, `isPlayerKind`), the kinds a user
 * customizes (`customizableKinds`) and those whose customizations have a page of their own (`customizationPages`), the
 * links an entity's page edits (`editedLinks`), the kinds a name is the identity of (`isIdentityKind`), an owned kind's
 * owner (`ownerOf`) and the kinds no other owns (`standaloneKinds`), each field and link role (`field`, `role`), and
 * the registries' rows (`registries`: its fields' derived from their declarations, `fieldDefsOf`). Names are global: two
 * modules declaring one kind, role, or field of one owner type is refused, as the registries' keys refuse it. What a
 * character's or a ruleset's Settings' write stores is its own module's fields' (`writtenFields`).
 */
export default class StorageEngine {
  constructor(modules: [BaseRules, RulesetModule][]) {
    this.baseRules = modules.map(([baseRules]) => baseRules);
    this.kinds = mergeRecords(modules, (module) => module.storage.kinds);
    this.owned = new Map(
      modules.map(([baseRules, module]) => {
        if (this.characterOwnerType in module.fields)
          throw new Error(`${baseRules} declares its characters' fields among its owners', not as theirs`);
        return [baseRules, { ...module.fields, [this.characterOwnerType]: module.characterFields }];
      }),
    );
    this.fields = mergeFields(this.owned, [this.characterOwnerType, this.settingsOwnerType]);
    this.playerKindList = modules.map(([, module]) => module.storage.character.playerKind);
    this.customizable = Object.keys(this.kinds)
      .filter((type) => this.kinds[type].customizable)
      .toSorted((a, b) => a.localeCompare(b));
    this.identityKinds = new Set(this.namesakeKinds("identity"));
    const registries = modules.map(([, module]) => module.storage.registries);
    const entityTypes = registries.flatMap((registry) => registry.entityTypes);
    this.merged = {
      entityTypes,
      linkRoles: registries.flatMap((registry) => registry.linkRoles),
      fieldDefs: this.fieldDefsOf(entityTypes),
      rulesetRoles: registries.flatMap((registry) => registry.rulesetRoles),
      characterRoles: registries.flatMap((registry) => registry.characterRoles),
      steps: registries.flatMap((registry) => registry.steps),
      itemTypes: registries.flatMap((registry) => registry.itemTypes),
    };
    StorageEngine.checkDeclarations(this.fields, this.merged);
    this.standalone = this.merged.entityTypes.flatMap((def) =>
      def.ownerType === null ? [def.type as EntityType] : [],
    );
    this.owners = new Map(
      this.merged.entityTypes.flatMap(({ ownerType, type }) => (ownerType ? [[type, ownerType]] : [])),
    );
    this.singleRoles = new Map(
      this.merged.entityTypes.map(({ type }) => [
        type,
        new Set(this.merged.linkRoles.filter((def) => def.fromType === type && def.single).map((def) => def.role)),
      ]),
    );
  }

  /** Every module's storage, merged once: the modules never change. */
  private static instance: StorageEngine | undefined;

  /**
   * Refuses a field or a link role whose merge or inheritance the engine can't read (`fields`, each owner type's, as
   * its module declares them): a merge it has no rule for, a union of what isn't a set (a single field's values, a
   * single link), or a field read off another but an entity's, or through a role that isn't single from its type to its
   * type (an item's template).
   */
  private static checkDeclarations(
    fields: Readonly<Record<string, Fields>>,
    { entityTypes, linkRoles }: StorageRegistries,
  ) {
    for (const role of linkRoles) {
      const name = `The link role ${role.role} from ${role.fromType}`;
      StorageEngine.checkMerge(name, role.merge, !role.single);
    }
    for (const [ownerType, owned] of Object.entries(fields)) {
      for (const leaf of Field.storedLeavesOf(owned)) {
        const name = `The field ${leaf.field} of ${ownerType}`;
        StorageEngine.checkMerge(name, leaf.merge, Field.storedKindOf(leaf).multiple);
        if (leaf.inherits === undefined) continue;
        const via = linkRoles.find(
          (role) => role.role === leaf.inherits && role.fromType === ownerType && role.toType === ownerType,
        );
        if (!entityTypes.some((def) => def.type === ownerType) || !via?.single)
          throw new Error(`${name} is read off another through ${leaf.inherits}, no single role from its type to it`);
      }
    }
  }

  /** Refuses a merge (`name`'s) the engine has no rule for, or a union of what isn't a set (`set`). */
  private static checkMerge(name: string, merge: Merge, set: boolean) {
    if (!MERGES.includes(merge)) throw new Error(`${name} merges by ${String(merge)}, no rule the engine has`);
    if (!set && merge === "union") throw new Error(`${name} holds one value: its sibling copies can't union it`);
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

  /**
   * The kinds a storage declares customizable (`storage`: a module's, or every module's merged) whose customizations
   * have a page of their own: all but a kind that owns another, whose customizations are its page's tabs (a class's).
   * An owned kind's names the kind that owns it (`owner`: a class level's class).
   */
  static customizationPagesOf({
    kinds,
    registries,
  }: Pick<StorageDeclaration, "kinds" | "registries">): RulesDescription["customizationPages"] {
    const owners = new Set(registries.entityTypes.map((def) => def.ownerType));
    return registries.entityTypes
      .filter(({ type }) => kinds[type].customizable && !owners.has(type))
      .map(({ ownerType, type }) => ({ type, ...(ownerType && { owner: ownerType }) }));
  }

  /** Every registered module's storage, merged: one instance, built on its first read. */
  static shared(): StorageEngine {
    StorageEngine.instance ??= new StorageEngine(Modules.all());
    return StorageEngine.instance;
  }

  private readonly baseRules: BaseRules[];

  /** The kinds a user customizes, by type (`customizableKinds`). */
  private readonly customizable: readonly string[];

  /** Every module's owners' fields, by owner type: its entity types', its rulesets' and its characters'. */
  private readonly fields: Record<string, Fields>;

  /** The kinds a name is the identity of (`isIdentityKind`). */
  private readonly identityKinds: ReadonlySet<string>;

  private readonly kinds: Record<string, StoredKind>;

  private readonly merged: StorageRegistries;

  /** Each module's owners' fields, by owner type (its characters' among them), by its base rules (`writtenFields`). */
  private readonly owned: ReadonlyMap<BaseRules, Record<string, Fields>>;

  /** Each kind another owns, by its type, and the kind that owns it, in their declarations' order (`ownerOf`). */
  private readonly owners: ReadonlyMap<string, string>;

  /** Each module's player character's kind. */
  private readonly playerKindList: readonly string[];

  /** The roles of each type's single links, which its record holds, by its type. */
  private readonly singleRoles: ReadonlyMap<string, ReadonlySet<string>>;

  /** The kinds no other owns, in their declarations' order (`standaloneKinds`). */
  private readonly standalone: readonly EntityType[];

  /** The owner type of a character's fields, which each module declares (`RulesetModule.characterFields`). */
  readonly characterOwnerType = "characters";

  /**
   * The owner type of a ruleset's Settings' fields, which each module declares among its owners'
   * (`RulesetModule.fields`).
   */
  readonly settingsOwnerType = "rulesets";

  /** The fields every module declares, as views keep their values, once read (`declaredFields`). */
  private declared?: DeclaredFields;

  /** The roles whose links an entity's page edits, and the kinds they're from and to, once read (`editedLinks`). */
  private edited?: ReadonlyMap<string, { from: string; to: string }>;

  /** The kinds whose customizations have a page of their own, by type, once read (`customizationPages`). */
  private pages?: ReadonlyMap<string, RulesDescription["customizationPages"][number]>;

  /** What every module declares of a view's kinds and links, once read (`viewSchema`). */
  private schema?: ViewSchema;

  /** What a write of each module's owners' fields stores, by its base rules, once read (`writtenFields`). */
  private writes?: ReadonlyMap<BaseRules, FieldWrites>;

  /**
   * The registry rows of every module's fields (`fields`), each stored field of an owner type (but a reference's, which a
   * single link keeps: `Field.storedLeavesOf`) with its owner's kind, the kind of value it holds and whether it's a set:
   * an entity type's (`entityTypes`), a ruleset's Settings' (`settingsOwnerType`) or a character's
   * (`characterOwnerType`). An owner type that's none of them, or a stored field two of its fields keep, is refused.
   */
  private fieldDefsOf(entityTypes: readonly EntityTypeDef[]): FieldDef[] {
    const kindOf = (ownerType: string): FieldDef["ownerKind"] => {
      if (ownerType === this.settingsOwnerType) return "ruleset";
      if (ownerType === this.characterOwnerType) return "character";
      if (entityTypes.some((def) => def.type === ownerType)) return "entity";
      throw new Error(`The fields of ${ownerType} are no entity type's, ruleset's or character's`);
    };
    return Object.entries(this.fields).flatMap(([ownerType, owned]) => {
      const ownerKind = kindOf(ownerType);
      const leaves = Field.storedLeavesOf(owned);
      const stored = new Set(leaves.map((leaf) => leaf.field));
      if (stored.size < leaves.length) throw new Error(`Two fields of ${ownerType} are stored in one`);
      return leaves.map((leaf) => ({ ownerKind, ownerType, field: leaf.field, ...Field.storedKindOf(leaf) }));
    });
  }

  /**
   * What writes a character's or a ruleset's Settings' fields (`fields`, of `ownerType`, which every module declares):
   * its own module's (`baseRules`), refusing a field it doesn't declare of them (another module's).
   */
  private ownWrites(ownerType: string, fields: Readonly<Record<string, FieldWrite>>, baseRules: BaseRules | undefined) {
    if (!baseRules) throw new Error(`A write of the fields of ${ownerType} takes its module's base rules`);
    const owners = this.owned.get(baseRules);
    const writes = this.writesOf(baseRules);
    if (!owners || !writes) throw new Error(`${baseRules} is no registered module's base rules`);
    const declared = new Set(Field.storedLeavesOf(owners[ownerType] ?? {}).map((leaf) => leaf.field));
    for (const field of Object.keys(fields))
      if (!declared.has(field)) throw new Error(`${baseRules} declares no field ${field} of ${ownerType}`);
    return writes;
  }

  /** What writes a module's owners' fields (`FieldWrites`, of its own declarations), by its base rules. */
  private writesOf(baseRules: BaseRules): FieldWrites | undefined {
    this.writes ??= new Map([...this.owned].map(([module, owners]) => [module, new FieldWrites(owners)]));
    return this.writes.get(baseRules);
  }

  /** A character's link role (3.5's `race`, `score`, `speaks`): the type of its entities, and whether it holds one. */
  characterRole(role: string): CharacterRoleDef {
    const found = this.merged.characterRoles.find((def) => def.role === role);
    if (!found) throw new Error(`No module declares the character role ${role}`);
    return found;
  }

  /**
   * The kinds a user customizes (`StoredKind.customizable`: 3.5's class levels, classes, feats, items, races and
   * spells), by type: the order a refusal of another lists them in.
   */
  customizableKinds(): readonly string[] {
    return this.customizable;
  }

  /**
   * The kinds whose customizations have a page of their own (`customizationPagesOf`, of every module's storage: 3.5's
   * feats, items, spells, races and class levels), by type: what an activity's link opens, as the client's rules
   * describe them (`RulesDescription.customizationPages`).
   */
  customizationPages(): ReadonlyMap<string, RulesDescription["customizationPages"][number]> {
    this.pages ??= new Map(
      StorageEngine.customizationPagesOf({ kinds: this.kinds, registries: this.merged }).map((page) => [
        page.type,
        page,
      ]),
    );
    return this.pages;
  }

  /** The fields every module declares, as a ruleset's view keeps their values (`DeclaredFields`): built once. */
  declaredFields(): DeclaredFields {
    this.declared ??= new DeclaredFields(this.fields, this.merged.linkRoles);
    return this.declared;
  }

  /**
   * The roles whose links an entity's page edits one at a time (`StoredKind.editedLinks`: 3.5's class's skills), each
   * with the kinds its links are from and to: what names their activities.
   */
  editedLinks(): ReadonlyMap<string, { from: string; to: string }> {
    this.edited ??= new Map(
      Object.entries(this.kinds).flatMap(([type, kind]) => {
        if (!kind.editedLinks) return [];
        const role = kind.editedLinks;
        const [def, ...others] = this.merged.linkRoles.filter((held) => held.role === role && held.fromType === type);
        if (!def || others.length > 0) throw new Error(`The kind ${type} edits its ${role} links to no one kind`);
        return [[role, { from: type, to: def.toType }]];
      }),
    );
    return this.edited;
  }

  /** A field of an owner's type (an entity type, `settingsOwnerType`, `characterOwnerType`), if a module declares it. */
  field(ownerType: string, field: string): FieldDef | undefined {
    return this.merged.fieldDefs.find((def) => def.ownerType === ownerType && def.field === field);
  }

  /**
   * An owner's fields as a view holds them (of `ownerType`, off its rows' values: `values`, each a field's and its value,
   * a set's in their stored order): a single field's value, a set's in its declared order, its fields in theirs
   * (`DeclaredFields`).
   */
  fieldsOf(ownerType: string, values: readonly (readonly [field: string, value: FieldValue])[]) {
    const rows = values.map(([field, value], ordinal) => ({ field, ordinal, value }));
    return this.declaredFields().fieldsOf(ownerType, rows);
  }

  /** Whether a kind's name is its identity (`StoredKind.namesakes`: 3.5's pools), its namesakes in a chain pairing. */
  isIdentityKind(type: string): boolean {
    return this.identityKinds.has(type);
  }

  /** Whether a character's kind is a player character's (`playerKinds`), not another's child (3.5's bonded creatures). */
  isPlayerKind(kind: string): boolean {
    return this.playerKindList.includes(kind);
  }

  /** An entity kind, by its type (`feats`): its partition's default, how its entities pair, what makes a template. */
  kind(type: string): StoredKind {
    const kind = this.kinds[type];
    if (!kind) throw new Error(`No module stores the kind ${type}`);
    return kind;
  }

  /**
   * Each kind's values kind-wide, of a ruleset's own entities (`entities`, as stored), by its type: each value of each
   * field it reads kind-wide (`DeclaredFields.kindWideFields`), with the entities that hold it, in the order those values
   * were written. None for a kind that reads none.
   */
  kindValues(entities: readonly StoredEntity[]): Map<string, KindValue[]> {
    const declared = this.declaredFields();
    const written = new Map<string, { createdAt: string; field: string; ownerId: string; value: string }[]>();
    for (const entity of entities) {
      const kindWide = declared.kindWideFields(entity.type);
      if (kindWide.size === 0) continue;
      const rows = written.get(entity.type) ?? written.set(entity.type, []).get(entity.type)!;
      for (const { createdAt, field, value } of entity.fields)
        if (kindWide.has(field)) rows.push({ createdAt, field, ownerId: entity.id, value: String(value) });
    }
    return new Map([...written].map(([type, rows]) => [type, StorageEngine.kindValuesOf(rows)]));
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

  /** The kind that owns a kind (`type`: a class level's class), none for a kind no other owns. */
  ownerOf(type: string): string | undefined {
    return this.owners.get(type);
  }

  /** The partition a new entity of a kind (`type`) is written in where its write gives none: its kind's default. */
  partitionOf(type: string): string {
    return this.kind(type).partition ?? "";
  }

  /**
   * Every module's player character's kind (3.5's `pc`): what a user's lists, shares and campaigns hold, a character of
   * any other kind being another's child.
   */
  playerKinds(): readonly string[] {
    return this.playerKindList;
  }

  /**
   * A stored entity as its record (`EntityRecord`): its own columns, every field it holds (`fieldsOf`), and its single
   * links' targets by role.
   */
  recordOf(entity: StoredEntity): EntityRecord {
    const { fields, links, ...own } = entity;
    const roles = this.singleRoles.get(entity.type);
    return {
      ...own,
      fields: this.declaredFields().fieldsOf(entity.type, fields),
      links: Object.fromEntries(links.flatMap(({ role, toId }) => (roles?.has(role) ? [[role, toId]] : []))),
    };
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

  /**
   * A ruleset's own Settings as its view holds them (`ruleset`, as stored): its fields (`fieldsOf`), and its links'
   * targets by role (3.5's skill point ability).
   */
  settingsOf(ruleset: StoredRuleset): StoredValues {
    return {
      fields: this.declaredFields().fieldsOf(this.settingsOwnerType, ruleset.fields),
      links: Object.fromEntries(ruleset.links.map(({ role, toId }) => [role, toId])),
    };
  }

  /**
   * The kinds no other owns (`StandaloneKind`: the types of a ruleset's entities, 3.5's classes but not their levels),
   * in their declarations' order: what the routes by kind take.
   */
  standaloneKinds(): readonly EntityType[] {
    return this.standalone;
  }

  /** An advancement's step. */
  step(step: string): StepDef {
    const found = this.merged.steps.find((def) => def.step === step);
    if (!found) throw new Error(`No module declares the step ${step}`);
    return found;
  }

  /**
   * A number an owner of a type (`type`, an entity type, `settingsOwnerType` or `characterOwnerType`) holds of a field,
   * as it's stored: refused unless it's a finite number its field holds exactly (`Decimals.holds`, to its places), and
   * kept to the places its field's declaration says (`scale`), whatever writes it (a form, a seed, a copy, an import).
   */
  storedNumber(type: string, field: string, value: unknown): string {
    const scale = this.declaredFields().scaleOf(type, field);
    if (typeof value !== "number" || !Number.isFinite(value) || !Decimals.holds(value, scale))
      throw new Error(`The field ${field} of ${type} holds a number it keeps exactly, not ${String(value)}`);
    return String(scale === undefined ? value : Decimals.toPlaces(value, scale));
  }

  /**
   * An entity's links (`entity`, as stored: a feat's pools, a class level's grants, an item's template), as a view holds
   * them, in their order: as they were made, then by their ordinal and their target.
   */
  viewLinksOf(entity: Pick<StoredEntity, "id" | "links">): ViewLink[] {
    return entity.links
      .toSorted((a, b) => compareText(a.createdAt, b.createdAt) || a.ordinal - b.ordinal || compareText(a.toId, b.toId))
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
    const items = new Set(this.merged.itemTypes);
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
            ...(inherits && { inherits }),
            ...(items.has(type) && { inventory: true as const }),
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

  /**
   * What a write of an owner's fields (`fields`, of `ownerType`: an entity type, `settingsOwnerType`,
   * `characterOwnerType`) stores, by field, whoever writes it (a seed, a form's save, an import), so the same values store
   * the same rows (`FieldWrites`): a new owner's (`creating`) or an existing one's. It takes the fields of the module
   * that declares them: an entity type's, the one module that stores it; a character's or a ruleset's Settings', which
   * every module declares, its own (`baseRules`, its ruleset's, `ownWrites`), so a new one holds its own module's
   * defaults alone, and a field another module declares is refused.
   */
  writtenFields(
    ownerType: string,
    fields: Readonly<Record<string, FieldWrite>>,
    creating: boolean,
    baseRules?: BaseRules,
  ) {
    if (ownerType === this.characterOwnerType || ownerType === this.settingsOwnerType)
      return this.ownWrites(ownerType, fields, baseRules).written(ownerType, fields, creating);
    const module = [...this.owned].find(([, owners]) => ownerType in owners)?.[0];
    return ((module && this.writesOf(module)) ?? new FieldWrites({})).written(ownerType, fields, creating);
  }
}
