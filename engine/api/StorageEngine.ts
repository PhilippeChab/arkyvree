import { DeclaredFields, type Fields, OwnerValues, type StoredValues } from "@/engine/core/fields/index.ts";
import type {
  CharacterRoleDef,
  FieldDef,
  FieldValue,
  LinkRoleDef,
  RulesetModule,
  StepDef,
  StorageRegistries,
  StoredCharacter,
  StoredColumn,
  StoredEntity,
  StoredKind,
  StoredRuleset,
  StoredWrite,
} from "@/engine/core/module/index.ts";
import type { KindValue, ViewLink, ViewSchema } from "@/engine/core/view/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

import Modules from "./Modules.ts";

/** A row, any kind's: its columns by their names, in the order its answers give them. */
type Row = Record<string, unknown>;

/**
 * The columns of an entity's own that a kind's row starts with, in their order: those a write may give past its kind's
 * (its owner's, position and partition among those).
 */
const ENTITY_COLUMNS = ["createdAt", "updatedAt", "deletedAt", "id", "rulesetId", "campaignId", "name", "description"];

/** Those an owned kind's row starts with (a class level's): its owner's scope, name and text are none of its own. */
const OWNED_COLUMNS = ["createdAt", "updatedAt", "deletedAt", "id"];

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

/** A stored value's text, a number's written out whatever its size (never in exponent form), as `roundDecimal` reads it. */
function numberText(value: unknown): string {
  return typeof value === "number"
    ? value.toLocaleString("en-US", { maximumFractionDigits: 20, useGrouping: false })
    : String(value);
}

/**
 * A number's text rounded to `scale` places, half away from zero, as Postgres's `round(numeric, scale)` writes it: its
 * places always shown (`5` to 2 places is `5.00`).
 */
function roundDecimal(given: string, scale: number): string {
  // A number's text in exponent form (JavaScript's below 1e-6: `1e-7`) written out, as Postgres reads either
  const text = /e/i.test(given) ? Number(given).toFixed(20) : given;
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = (negative || text.startsWith("+") ? text.slice(1) : text).split(".");
  let units = BigInt(whole + fraction.padEnd(scale, "0").slice(0, scale));
  if ((fraction[scale] ?? "0") >= "5") units += 1n;
  const digits = units.toString().padStart(scale + 1, "0");
  const rounded = scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  return negative && units !== 0n ? `-${rounded}` : rounded;
}

/** A value a number column is written with, refused when it's no number (a blank text, a word, a flag), as the column is. */
function toNumber(value: unknown): number {
  const number =
    typeof value === "number" || (typeof value === "string" && value.trim() !== "") ? Number(value) : Number.NaN;
  if (!Number.isFinite(number)) throw new Error(`Not a number: ${String(value)}`);
  return number;
}

/**
 * How every registered module stores its data in the generic tables, which the server reads and writes them by: each
 * kind's row (`kind`), an entity's links of a role it holds many of (`viewLinksOf`), a character's (`character`), each
 * field and link role (`field`, `role`), and the registries' rows (`registries`). Names are global: two modules
 * declaring one kind, field or role is refused, as the registries' keys refuse it.
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
  }

  /** Every module's storage, merged once: the modules never change. */
  private static instance: StorageEngine | undefined;

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

  /** Each kind's row's columns, in their order: an entity's own (an owned kind's fewer), then its kind's. */
  private readonly columnOrders = new Map<string, string[]>();

  /** Every module's owners' fields, by owner type. */
  private readonly fields: Record<string, Fields>;

  private readonly kinds: Record<string, StoredKind>;

  private readonly merged: StorageRegistries;

  private columnFieldNames: Set<string> | undefined;

  /** The fields every module declares, as views keep their values, once read (`declaredFields`). */
  private declared?: DeclaredFields;

  /** The roles an entity holds many links of, by its type, once read (`viewLinksOf`). */
  private manyRoles?: Map<string, Set<string>>;

  private rowReads: { fields: string[]; roles: string[] } | undefined;

  /** What every module declares of a view's kinds and links, once read (`viewSchema`). */
  private schema?: ViewSchema;

  /** The fields every kind's columns hold, which its row reads: not its owner's other stored values. */
  private columnFields(): Set<string> {
    this.columnFieldNames ??= new Set(
      Object.values(this.kinds).flatMap((kind) =>
        Object.values(kind.columns).flatMap((column) => ("field" in column ? [column.field] : [])),
      ),
    );
    return this.columnFieldNames;
  }

  /** A kind's row's columns, in the order its answers give them. */
  private columnOrder(type: string): string[] {
    let order = this.columnOrders.get(type);
    if (!order) {
      const kind = this.kind(type);
      const own = this.merged.entityTypes.find((def) => def.type === type)?.ownerType ? OWNED_COLUMNS : ENTITY_COLUMNS;
      order = kind.order ?? [...new Set([...own, ...Object.keys(kind.columns)])];
      this.columnOrders.set(type, order);
    }
    return order;
  }

  /** The value of a stored column of an entity: its field's (a single value), its single link's, or its own. */
  private columnValue(entity: StoredEntity, column: StoredColumn): unknown {
    switch (column.kind) {
      case "link":
        return entity.links.find((link) => link.role === column.role)?.toId ?? null;
      case "owner":
        return entity.ownerId;
      case "partition":
        return entity.partition;
      case "position":
        return entity.position;
      default: {
        const value = entity.fields.find((field) => field.field === column.field && field.ordinal === 0)?.value;
        if (value === undefined) return null;
        if (column.kind === "flag") return value === true;
        if (column.kind === "text") return value;
        return "integer" in column
          ? Number(roundDecimal(numberText(value), 0))
          : roundDecimal(numberText(value), column.scale);
      }
    }
  }

  /**
   * What a kind's entities read off another's when they hold none (`inherits`: an item's template's fields), by the
   * column its row names that entity by: none for a kind that reads none.
   */
  private inheritsOf(type: string): { inherits?: { column: string; fields: ReadonlySet<string> } } {
    const inheritance = this.declaredFields().inheritance(type);
    if (!inheritance) return {};
    const found = Object.entries(this.kind(type).columns).find(
      ([, column]) => column.kind === "link" && column.role === inheritance.role,
    );
    if (!found) throw new Error(`The kind ${type} names no ${inheritance.role} its fields are read off`);
    return { inherits: { column: found[0], fields: inheritance.fields } };
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
   * The types whose owners hold fields past their kind's columns, which their form shows and their save writes, as
   * their modules declare them: kinds' (3.5's feats, items, spells, races, classes, class levels and skills) and the
   * rulesets' (their settings).
   */
  fieldOwners(): string[] {
    return Object.keys(this.fields);
  }

  /** An entity kind's row, by its type (`feats`): its columns past an entity's own. */
  kind(type: string): StoredKind {
    const kind = this.kinds[type];
    if (!kind) throw new Error(`No module stores the kind ${type}`);
    return kind;
  }

  /**
   * What every kind's row reads of its entity past its own columns: its columns' fields (their single value, ordinal
   * 0), and its single links' roles. A read of rows alone reads no more (an owner's other fields, `valuesOf`'s, it
   * leaves; its links of a role it holds many of, `viewLinksOf`'s).
   */
  kindReads(): { fields: string[]; roles: string[] } {
    this.rowReads ??= {
      fields: [...this.columnFields()],
      roles: [
        ...new Set(
          Object.values(this.kinds).flatMap((kind) =>
            Object.values(kind.columns).flatMap((column) => (column.kind === "link" ? [column.role] : [])),
          ),
        ),
      ],
    };
    return this.rowReads;
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

  /** An owned kind's rows (`type`: a class's levels), each its id, its owner's and its position in it (a level's). */
  ownedPositionsOf(type: string, rows: Row[]): { entityType: string; id: string; ownerId: string; position: number }[] {
    const [owner, position] = [this.ownerColumn(type), this.positionColumn(type)];
    return rows.map((row) => ({
      entityType: type,
      id: String(row.id),
      ownerId: String(row[owner]),
      position: Number(row[position]),
    }));
  }

  /** The kinds another owns (3.5's class levels), in their declarations' order. */
  ownedTypes(): string[] {
    return this.merged.entityTypes.flatMap((def) => (def.ownerType ? [def.type] : []));
  }

  /** The column an owned kind's row names its owner by (`type`: a class level's `klassId`). */
  ownerColumn(type: string): string {
    const found = Object.entries(this.kind(type).columns).find(([, column]) => column.kind === "owner");
    if (!found) throw new Error(`No module stores ${type} as owned`);
    return found[0];
  }

  /** The kinds that own another (3.5's classes, their levels'), in the order their owned kinds are declared. */
  ownerKinds(): string[] {
    return [...new Set(this.merged.entityTypes.flatMap((def) => (def.ownerType ? [def.ownerType] : [])))];
  }

  /** The column an owned kind's row holds its position in its owner at (`type`: a class level's `level`). */
  positionColumn(type: string): string {
    const found = Object.entries(this.kind(type).columns).find(([, column]) => column.kind === "position");
    if (!found) throw new Error(`No module stores ${type} with a position`);
    return found[0];
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
   * A stored entity as its kind's row (its type's declaration): an entity's own columns (an owned kind's fewer), then
   * what its fields and single links hold, in its declared order.
   */
  rowOf(entity: StoredEntity): Row {
    const kind = this.kind(entity.type);
    // Written into one object in its order, no row built on the way: a view's rows are many, and kept
    const row: Row = {};
    for (const name of this.columnOrder(entity.type)) {
      const column = kind.columns[name];
      row[name] = column ? this.columnValue(entity, column) : entity[name as keyof StoredEntity];
    }
    return row;
  }

  /** An advancement's step. */
  step(step: string): StepDef {
    const found = this.merged.steps.find((def) => def.step === step);
    if (!found) throw new Error(`No module declares the step ${step}`);
    return found;
  }

  /**
   * An owner's stored values (of `type`), off its fields past its kind's columns (`fields`) and its links (`links`):
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
   * composes them: each owner's, by its type then its id (`values`), its fields past its kind's columns (a ruleset's
   * all of them), each set's values and the fields themselves in their declared order (`DeclaredFields`), and the
   * links its kind's fields read, by role; an owner that holds none is left out. And each kind's values kind-wide
   * (`kindValues`), each with the entities that hold it, in the order those values were written.
   */
  valuesOf(owners: { entities: StoredEntity[]; ruleset?: StoredRuleset }): {
    kindValues: Map<string, KindValue[]>;
    values: Map<string, Map<string, StoredValues>>;
  } {
    const columnFields = this.columnFields();
    const values = new Map<string, Map<string, StoredValues>>();
    const written = new Map<string, { createdAt: string; field: string; ownerId: string; value: string }[]>();
    for (const entity of owners.entities) {
      const fields = entity.fields.filter((field) => !columnFields.has(field.field));
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
   * An entity's links of the roles it holds many of (`entity`, as stored: a feat's pools, a class level's grants), as a
   * view holds them, in their order: as they were made, then by their ordinal and their target. Its single links are
   * its row's columns or its fields' (`rowOf`, `storedValuesOf`).
   */
  viewLinksOf(entity: Pick<StoredEntity, "id" | "links" | "type">): ViewLink[] {
    this.manyRoles ??= new Map(
      [
        ...Map.groupBy(
          this.merged.linkRoles.filter((def) => !def.single),
          (def) => def.fromType,
        ),
      ].map(([fromType, defs]) => [fromType, new Set(defs.map((def) => def.role))]),
    );
    const roles = this.manyRoles.get(entity.type);
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
   * What a ruleset's view is composed by, of every module's declaration (`ViewSchema`): each kind's owner, and the links
   * whose sibling copies' merge into their winner's (`unionLinks`: a feat's pools). Read once.
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
        .map(({ ownerType, type }) => ({
          type,
          customizable: this.kind(type).customizable ?? false,
          fields: fields.has(type),
          ...this.inheritsOf(type),
          ...(ownerType
            ? { owner: { column: this.ownerColumn(type), position: this.positionColumn(type), type: ownerType } }
            : {}),
          tracked: tracked.has(type),
        })),
      unionLinks: this.merged.linkRoles
        .filter((def) => !def.single && def.merge === "union")
        .map(({ fromType, role, toType }) => ({ fromType, role, toType })),
    };
    return this.schema;
  }

  /**
   * What a write of a kind's row stores (`values`: its columns by name): the entity's own columns it gives, and the
   * fields and single links of each column it gives, typed (a decimal rounded to its scale), or null to clear it.
   * `creating`: a new row's, whose every column is written, one it leaves out its default (its partition's too).
   */
  writeOf(type: string, values: Row, creating: boolean): StoredWrite {
    const own: StoredWrite["own"] = Object.fromEntries(
      ENTITY_COLUMNS.filter((name) => values[name] !== undefined).map((name) => [name, values[name]]),
    );
    const write: StoredWrite = { own, fields: [], links: [] };
    for (const [name, column] of Object.entries(this.kind(type).columns)) {
      const value = values[name];
      if (column.kind === "owner" || column.kind === "position") {
        if (value !== undefined) own[column.kind === "owner" ? "ownerId" : "position"] = value as never;
      } else if (column.kind === "partition") {
        if (value !== undefined || creating) own.partition = (value as string | undefined) ?? column.default;
      } else if (value !== undefined || creating) {
        if (column.kind === "link") {
          const role = this.merged.linkRoles.find((def) => def.role === column.role && def.fromType === type)!;
          write.links.push({
            role: column.role,
            single: role.single,
            toId: (value as string | null) ?? null,
            toType: role.toType,
          });
        } else {
          const held = value ?? ("default" in column ? column.default : undefined) ?? null;
          const typed =
            held === null
              ? null
              : column.kind === "flag"
                ? Boolean(held)
                : column.kind === "number"
                  ? toNumber("scale" in column ? roundDecimal(numberText(held), column.scale) : held)
                  : String(held);
          write.fields.push({ field: column.field, kind: column.kind, value: typed });
        }
      }
    }
    return write;
  }
}
