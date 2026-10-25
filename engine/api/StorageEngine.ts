import type {
  CharacterRoleDef,
  FieldDef,
  LinkPart,
  LinkRoleDef,
  ListLink,
  RulesetModule,
  StepDef,
  StorageRegistries,
  StoredAdvancement,
  StoredCharacter,
  StoredCharacterLink,
  StoredCharacterRow,
  StoredCharacterWrite,
  StoredColumn,
  StoredEntity,
  StoredJoin,
  StoredKind,
  StoredLink,
  StoredPick,
  StoredRuleset,
  StoredWrite,
} from "@/engine/core/module/index.ts";
import type { ViewSchema } from "@/engine/core/view/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

import Modules from "./Modules.ts";

/** A row, any kind's or join's: its columns by their names, in the order its answers give them. */
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

/** Postgres's text of a timestamp (`2026-01-01 00:00:00.5+00`) as JSON gives it (`2026-01-01T00:00:00.5+00:00`). */
function jsonTimestamp(text: string): string;
function jsonTimestamp(text: string | null): string | null;
function jsonTimestamp(text: string | null): string | null {
  if (text === null) return null;
  return text.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00");
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

/** A value a number column is written with, refused when it's no number (a blank text, a word), as the column is. */
function toNumber(value: unknown): number {
  const number = typeof value === "string" && value.trim() === "" ? Number.NaN : Number(value);
  if (!Number.isFinite(number)) throw new Error(`Not a number: ${String(value)}`);
  return number;
}

/**
 * How every registered module stores its data in the generic tables, which the server reads and writes them by: each
 * kind's row (`kind`), each join's (`join`), a character's (`character`), each field and link role (`field`, `role`),
 * and the registries' rows (`registries`). Names are global: two modules declaring one kind, join, field or role is
 * refused, as the registries' keys refuse it.
 */
export default class StorageEngine {
  constructor(modules: [BaseRules, RulesetModule][]) {
    this.baseRules = modules.map(([baseRules]) => baseRules);
    this.kinds = mergeRecords(modules, (module) => module.storage.kinds);
    this.joins = mergeRecords(modules, (module) => module.storage.joins);
    this.linkedEntityProperties = mergeRecords(modules, (module) => module.storage.linkedProperties.entities);
    this.linkedRulesetProperties = mergeRecords(modules, (module) => module.storage.linkedProperties.rulesets);
    const characters = modules.map(([, module]) => module.storage.character);
    this.characterDeclaration = {
      ...characters[0],
      columns: mergeRecords(modules, (module) => module.storage.character.columns),
      links: mergeRecords(modules, (module) => module.storage.character.links),
      picks: mergeRecords(modules, (module) => module.storage.character.picks),
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

  /** Every registered module's storage, merged: one instance, built on its first read. */
  static shared(): StorageEngine {
    StorageEngine.instance ??= new StorageEngine(Modules.all());
    return StorageEngine.instance;
  }

  private readonly baseRules: BaseRules[];

  private readonly characterDeclaration: StoredCharacter;

  /** Each kind's row's columns, in their order: an entity's own (an owned kind's fewer), then its kind's. */
  private readonly columnOrders = new Map<string, string[]>();

  private readonly joins: Record<string, StoredJoin>;

  private readonly kinds: Record<string, StoredKind>;

  private readonly linkedEntityProperties: Record<string, Record<string, string>>;

  private readonly linkedRulesetProperties: Record<string, string>;

  private readonly merged: StorageRegistries;

  private columnFieldNames: Set<string> | undefined;

  private rowReads: { fields: string[]; roles: string[] } | undefined;

  /** What every module declares of a view's kinds and joins, once read (`viewSchema`). */
  private schema?: ViewSchema;

  /** A character link role. */
  private characterRole(role: string): CharacterRoleDef {
    return this.merged.characterRoles.find((def) => def.role === role)!;
  }

  /** The fields every kind's columns hold, which its row reads: not properties. */
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

  /** The column a join's row holds one of its parts in (`part`: its from-entity, its target), refused without one. */
  private joinColumn(name: string, part: LinkPart, word: string): string {
    const found = Object.entries(this.join(name).columns).find(([, held]) => held === part);
    if (!found) throw new Error(`The join ${name} names no ${word}`);
    return found[0];
  }

  /** A join's row of a link from an entity: its timestamps, then each part under its column's name. */
  private joinRow(join: StoredJoin, fromId: string, link: StoredLink, json: boolean): Row {
    const parts: Record<LinkPart, unknown> = {
      amount: link.amount,
      free: link.free,
      from: fromId,
      id: link.id,
      tier: link.tier,
      to: link.toId,
      via: link.viaId,
    };
    const row: Row = {
      createdAt: json ? jsonTimestamp(link.createdAt) : link.createdAt,
      updatedAt: json ? jsonTimestamp(link.updatedAt) : link.updatedAt,
      deletedAt: null,
    };
    for (const column in join.columns) row[column] = parts[join.columns[column]];
    return row;
  }

  /** A level's row (`values`, by its module's columns), as what a write of its advancement stores: its track, its value. */
  advancementOf(values: Row): { trackId?: string; value?: number } {
    const { track, value } = this.characterDeclaration.advancement;
    return { trackId: values[track] as string | undefined, value: values[value.column] as number | undefined };
  }

  /** An advancement as its module's level row: its track and its value step's amount under their names. */
  advancementRowOf(advancement: StoredAdvancement): Row {
    const { track, value } = this.characterDeclaration.advancement;
    return {
      id: advancement.id,
      characterId: advancement.characterId,
      [track]: advancement.trackId,
      [value.column]: advancement.value,
      position: advancement.position,
      createdAt: advancement.createdAt,
      updatedAt: advancement.updatedAt,
      deletedAt: advancement.deletedAt,
    };
  }

  /** A character's data, as every module stores it: its columns, its links and its advancements' picks. */
  character(): StoredCharacter {
    return this.characterDeclaration;
  }

  /** A character link's row (`row`, by its columns), of a link's (`name`), as what a write of it stores. */
  characterLinkOf(name: string, row: Row) {
    const link = this.characterDeclaration.links[name];
    const role = this.characterRole(link.role);
    return {
      characterId: row.characterId as string,
      role: link.role,
      single: role.single,
      entityId: row[link.entity] as string,
      entityType: role.entityType,
      amount: link.amount ? (row[link.amount] as number) : null,
      createdAt: row.createdAt as string | undefined,
      updatedAt: row.updatedAt as string | undefined,
    };
  }

  /**
   * A character's link a plan writes (`link`: its entity, its amount if its link holds one), of a link's (`name`), as
   * what a write of it stores.
   */
  characterLinkOfPlan(name: string, characterId: string, link: { amount?: number; entityId: string }) {
    const declared = this.characterDeclaration.links[name];
    return this.characterLinkOf(name, {
      characterId,
      [declared.entity]: link.entityId,
      ...(declared.amount ? { [declared.amount]: link.amount } : {}),
    });
  }

  /** A character's link as its module's row of `name` (its scores, its languages): its entity, its amount. */
  characterLinkRowOf(name: string, link: StoredCharacterLink): Row {
    const declared = this.characterDeclaration.links[name];
    return {
      characterId: link.characterId,
      [declared.entity]: link.entityId,
      ...(declared.amount ? { [declared.amount]: link.amount } : {}),
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
      deletedAt: null,
    };
  }

  /**
   * A stored character as its module's row: its own columns, then what its fields and single links hold (a number's
   * rounded to a whole one), in its declared order.
   */
  characterRowOf({ fields, links, ...own }: StoredCharacterRow): Row {
    const { columns, order } = this.characterDeclaration;
    const row: Row = { ...own };
    for (const [name, column] of Object.entries(columns)) {
      if (column.kind === "link") {
        row[name] = links.find((link) => link.role === column.role)?.toId ?? null;
        continue;
      }
      const value = fields.find((field) => field.field === column.field)?.value ?? null;
      row[name] = value !== null && column.kind === "number" ? Number(roundDecimal(numberText(value), 0)) : value;
    }
    return order ? Object.fromEntries(order.map((name) => [name, row[name]])) : row;
  }

  /** What a write of a character's row stores (`values`, by its columns). */
  characterWriteOf(values: Row): StoredCharacterWrite {
    const { columns } = this.characterDeclaration;
    const write: StoredCharacterWrite = {
      own: Object.fromEntries(Object.entries(values).filter(([name]) => !(name in columns))),
      fields: [],
      links: [],
    };
    for (const [name, column] of Object.entries(columns)) {
      const value = values[name];
      // A value left undefined is left as it is, as an update leaves a column it's given undefined
      if (value === undefined) continue;
      if (column.kind !== "link") {
        const held = value === null ? null : column.kind === "number" ? toNumber(value) : String(value);
        write.fields.push({ field: column.field, kind: column.kind, value: held });
        continue;
      }
      const role = this.characterRole(column.role);
      const toId = value === null ? null : String(value);
      write.links.push({ role: column.role, single: role.single, entityType: role.entityType, toId });
    }
    return write;
  }

  /** The kinds a user customizes (`StoredKind.customizable`: 3.5's feats, items, spells, races, classes and levels). */
  customizableKinds(): string[] {
    return Object.keys(this.kinds).filter((type) => this.kinds[type].customizable);
  }

  /** A field of an owner's type (an entity type, `rulesets` or `characters`), if a module declares it. */
  field(ownerType: string, field: string): FieldDef | undefined {
    return this.merged.fieldDefs.find((def) => def.ownerType === ownerType && def.field === field);
  }

  /** A join's rows, by its name (`feats_aptitudes`): the links of a role from one kind to another. */
  join(name: string): StoredJoin {
    const join = this.joins[name];
    if (!join) throw new Error(`No module stores the join ${name}`);
    return join;
  }

  /**
   * A join's row (`row`, by its columns) as a copy of its from-entity holds it: from the copy (`fromId`), the entities
   * it names resolved (`resolve`: to what stands for them), its other parts kept; a new link, no id of its own.
   */
  joinCopyOf(name: string, row: Row, fromId: string, resolve: (id: string) => string): Row {
    const { columns } = this.join(name);
    const copy: Row = {};
    for (const column in columns) {
      const part = columns[column];
      if (part === "from") copy[column] = fromId;
      else if (part === "to" || part === "via")
        copy[column] = row[column] === null ? null : resolve(String(row[column]));
      else if (part !== "id") copy[column] = row[column];
    }
    return copy;
  }

  /** The column a join's row names its from-entity by (`name`: a class level's grants' `klassLevelId`). */
  joinFromColumn(name: string): string {
    return this.joinColumn(name, "from", "from-entity");
  }

  /** Every join's name. */
  joinNames(): string[] {
    return Object.keys(this.joins);
  }

  /**
   * A join's rows (`name`) of entities' links (`entities`, of its from-kind): its role's to its to-kind, in their order
   * (as they were made, each entity's in its order). `json`: their timestamps as JSON gives them (a nested row's).
   */
  joinRowsOf(name: string, entities: Pick<StoredEntity, "id" | "links" | "type">[], json = false): Row[] {
    const join = this.join(name);
    const links = entities.flatMap((entity) =>
      entity.type !== join.from
        ? []
        : entity.links
            .filter((link) => link.role === join.role && link.toType === join.to)
            .map((link) => ({ fromId: entity.id, link })),
    );
    links.sort(
      (a, b) =>
        compareText(a.link.createdAt, b.link.createdAt) ||
        compareText(a.fromId, b.fromId) ||
        a.link.ordinal - b.link.ordinal ||
        compareText(a.link.toId, b.link.toId),
    );
    return links.map(({ fromId, link }) => this.joinRow(join, fromId, link, json));
  }

  /** An entity kind's row, by its type (`feats`): its columns past an entity's own. */
  kind(type: string): StoredKind {
    const kind = this.kinds[type];
    if (!kind) throw new Error(`No module stores the kind ${type}`);
    return kind;
  }

  /**
   * What every kind's row reads of its entity past its own columns: its columns' fields (their single value, ordinal
   * 0), and its single links' and lists' roles. A read of rows alone reads no more (a property's fields it leaves).
   */
  kindReads(): { fields: string[]; roles: string[] } {
    this.rowReads ??= {
      fields: [...this.columnFields()],
      roles: [
        ...new Set(
          Object.values(this.kinds).flatMap((kind) => [
            ...Object.values(kind.columns).flatMap((column) => (column.kind === "link" ? [column.role] : [])),
            ...Object.values(kind.lists ?? {}).map((list) => this.join(list.join).role),
          ]),
        ),
      ],
    };
    return this.rowReads;
  }

  /** The property types a link holds, an owner type's: each with its role. */
  linkedProperties(ownerType: string): [propertyType: string, role: string][] {
    return Object.entries(
      ownerType === "rulesets" ? this.linkedRulesetProperties : (this.linkedEntityProperties[ownerType] ?? {}),
    );
  }

  /**
   * The role of the link a property type of an owner's type holds (a class's bonus spell ability, a ruleset's skill
   * point ability), if it holds one: an entity's link role, or a ruleset's ruleset role.
   */
  linkedProperty(ownerType: string, propertyType: string): string | undefined {
    if (ownerType === "rulesets") return this.linkedRulesetProperties[propertyType];
    return this.linkedEntityProperties[ownerType]?.[propertyType];
  }

  /**
   * A join's row (`values`, by its columns' names) as its link's parts: what a write of it stores, a part it leaves out
   * its default (no pool, no tier, no amount, not free). Its timestamps and id when it gives them (a copy's).
   */
  linkOf(name: string, values: Row) {
    const join = this.join(name);
    const part = (wanted: LinkPart) => {
      const column = Object.keys(join.columns).find((key) => join.columns[key] === wanted);
      return column === undefined ? undefined : values[column];
    };
    return {
      id: part("id") as string | undefined,
      fromId: String(part("from")),
      toId: String(part("to")),
      viaId: (part("via") as string | null | undefined) ?? null,
      tier: (part("tier") as number | null | undefined) ?? null,
      amount: (part("amount") as number | null | undefined) ?? null,
      free: (part("free") as boolean | undefined) ?? false,
      createdAt: values.createdAt as string | undefined,
      updatedAt: values.updatedAt as string | undefined,
    };
  }

  /** A kind's list's join rows (`rows`, by its columns) as list links, each with the entity it's from. */
  listLinksOf(type: string, rows: Row[]): { fromId: string; level: number | null; listId: string }[] {
    const [list] = Object.values(this.kind(type).lists ?? {});
    if (!list) return [];
    const { columns } = this.join(list.join);
    const column = (part: LinkPart) => Object.keys(columns).find((name) => columns[name] === part);
    const [from, to, tier] = [column("from")!, column("to")!, column("tier")];
    return rows.map((row) => ({
      fromId: String(row[from]),
      level: tier ? ((row[tier] as number | null) ?? null) : null,
      listId: String(row[to]),
    }));
  }

  /**
   * An entity's list links (`links`: the lists it's in, at a tier if they rank it: a spell's level) as its kind's
   * list's join rows (`join`, its name), none for a kind without a list.
   */
  listRowsOf(type: string, entityId: string, links: ListLink[]) {
    const [list] = Object.values(this.kind(type).lists ?? {});
    if (!list) return undefined;
    const { columns } = this.join(list.join);
    const parts = (link: (typeof links)[number]): Partial<Record<LinkPart, unknown>> => ({
      from: entityId,
      to: link.listId,
      tier: link.level ?? null,
    });
    return {
      join: list.join,
      rows: links.map((link) => {
        const values = parts(link);
        const row: Row = {};
        for (const column in columns) if (columns[column] in values) row[column] = values[columns[column]];
        return row;
      }),
    };
  }

  /** The ids of the entities stored entities' lists name (a feat's pools' aptitudes): what their rows nest. */
  listTargetIds(entities: StoredEntity[]): string[] {
    const ids = new Set<string>();
    for (const entity of entities) {
      for (const list of Object.values(this.kind(entity.type).lists ?? {})) {
        const join = this.join(list.join);
        for (const link of entity.links) if (link.role === join.role && link.toType === join.to) ids.add(link.toId);
      }
    }
    return [...ids];
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

  /** A pick's row (`row`, by its columns), of a step's (`name`), as what a write of it stores past its ordinal. */
  pickOf(name: string, row: Row) {
    const pick = this.characterDeclaration.picks[name];
    const step = this.step(pick.step);
    const viaId = pick.via ? ((row[pick.via] as string | null | undefined) ?? null) : null;
    return {
      id: pick.id ? (row.id as string | undefined) : undefined,
      advancementId: row.characterLevelId as string,
      step: pick.step,
      entityId: row[pick.entity] as string,
      entityType: step.entityType,
      viaId,
      viaType: viaId ? step.viaType : null,
      amount: pick.amount ? (row[pick.amount] as number) : null,
      repeats: step.repeats,
    };
  }

  /** An advancement's pick as its module's row of `name` (its feats, its skills): its entity, its pool, its amount. */
  pickRowOf(name: string, pick: StoredPick): Row {
    const declared = this.characterDeclaration.picks[name];
    return {
      ...(declared.id ? { id: pick.id } : {}),
      characterLevelId: pick.advancementId,
      [declared.entity]: pick.entityId,
      ...(declared.via ? { [declared.via]: pick.viaId } : {}),
      ...(declared.amount ? { [declared.amount]: pick.amount } : {}),
      createdAt: pick.createdAt,
      updatedAt: pick.updatedAt,
      deletedAt: null,
    };
  }

  /** The column an owned kind's row holds its position in its owner at (`type`: a class level's `level`). */
  positionColumn(type: string): string {
    const found = Object.entries(this.kind(type).columns).find(([, column]) => column.kind === "position");
    if (!found) throw new Error(`No module stores ${type} with a position`);
    return found[0];
  }

  /**
   * The properties of stored entities and rulesets, as the engine reads them (`Property`): their fields past their
   * kinds' columns (a feat's family), each value as text, and the entities the properties a link holds name (a class's
   * bonus spell ability). In the order they were written, by owner, type and value; of `entityType` and of `type`
   * when given.
   */
  propertiesOf(
    owners: { entities?: StoredEntity[]; rulesets?: StoredRuleset[] },
    where: { entityType?: string; type?: string } = {},
  ): Row[] {
    const columnFields = this.columnFields();
    const rows: {
      createdAt: string;
      entityId: string;
      entityType: string;
      ordinal: number;
      type: string;
      updatedAt: string;
      value: string;
    }[] = [];
    const owned = [
      ...(owners.entities ?? []).map((entity) => ({ ...entity, ownerType: entity.type })),
      ...(owners.rulesets ?? []).map((ruleset) => ({ ...ruleset, ownerType: "rulesets" })),
    ];
    for (const { fields, id: entityId, links, ownerType: entityType } of owned) {
      const own = fields.filter((field) => entityType === "rulesets" || !columnFields.has(field.field));
      rows.push(
        ...own.map((field) => ({ ...field, entityId, entityType, type: field.field, value: String(field.value) })),
      );
      for (const [type, role] of this.linkedProperties(entityType)) {
        const linked = links.filter((link: { role: string }) => link.role === role);
        rows.push(...linked.map((link) => ({ ...link, entityId, entityType, ordinal: 0, type, value: link.toId })));
      }
    }
    return rows
      .filter(
        (row) => (!where.entityType || row.entityType === where.entityType) && (!where.type || row.type === where.type),
      )
      .sort(
        (a, b) =>
          compareText(a.createdAt, b.createdAt) ||
          compareText(a.entityId, b.entityId) ||
          compareText(a.type, b.type) ||
          compareText(a.value, b.value),
      )
      .map((row) => ({
        // In the order a property's answer gives its columns
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        deletedAt: null,
        id: `${row.entityId}:${row.type}:${row.ordinal}`,
        entityId: row.entityId,
        entityType: row.entityType,
        value: row.value,
        type: row.type,
        description: null,
      }));
  }

  /**
   * The types whose properties hold fields past their kind's columns, which their form shows and their save writes:
   * kinds' (3.5's feats, items, spells, races, classes, class levels and skills) and the rulesets' (their settings).
   */
  propertyTypes(): string[] {
    const columnFields = new Set(
      Object.values(this.kinds).flatMap((kind) =>
        Object.values(kind.columns).flatMap((column) => ("field" in column ? [column.field] : [])),
      ),
    );
    const types = this.merged.fieldDefs
      .filter((def) => def.ownerKind !== "character" && !columnFields.has(def.field))
      .map((def) => def.ownerType);
    return [...new Set(types)];
  }

  /**
   * The joins whose links to an entity of a kind (`type`) refuse its delete, by their names (a class level's base bonus
   * to a save): an entity one links to is in use.
   */
  refusingJoins(type: string): string[] {
    return Object.entries(this.joins)
      .filter(([, join]) => join.to === type && this.role(join.role, join.from, join.to).onDelete === "refuse")
      .map(([name]) => name);
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
   * what its fields and single links hold, in its declared order; then, given the entities its lists' links name
   * (`targets`, by id), its lists, each join row with its target's row (a link to one it lacks left out), as a list's
   * read nests them. `json`: its timestamps as JSON gives them (a nested row's).
   */
  rowOf(
    entity: StoredEntity,
    { json = false, targets }: { json?: boolean; targets?: ReadonlyMap<string, StoredEntity> } = {},
  ): Row {
    const kind = this.kind(entity.type);
    // Written into one object in its order, no row built on the way: a view's rows are many, and kept
    const row: Row = {};
    for (const name of this.columnOrder(entity.type)) {
      const column = kind.columns[name];
      if (column) row[name] = this.columnValue(entity, column);
      else if (json && (name === "createdAt" || name === "updatedAt" || name === "deletedAt"))
        row[name] = jsonTimestamp(entity[name]);
      else row[name] = entity[name as keyof StoredEntity];
    }
    for (const [name, list] of Object.entries(targets ? (kind.lists ?? {}) : {})) {
      const join = this.join(list.join);
      row[name] = this.joinRowsOf(list.join, [entity], true).flatMap((joined) => {
        const target = targets!.get(
          String(joined[Object.keys(join.columns).find((column) => join.columns[column] === "to")!]),
        );
        return target ? [{ ...joined, [list.target]: this.rowOf(target, { json: true }) }] : [];
      });
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
   * What a ruleset's view is composed by, of every module's declaration (`ViewSchema`): each kind's owner and the lists
   * its rows nest, each join its kinds' lists don't nest. Read once.
   */
  viewSchema(): ViewSchema {
    if (this.schema) return this.schema;
    const types = this.merged.entityTypes;
    const listed = new Set(types.flatMap(({ type }) => Object.values(this.kind(type).lists ?? {}).map((l) => l.join)));
    const joins = this.joinNames()
      .filter((name) => !listed.has(name))
      .map((name) => ({ name, from: this.join(name).from, fromColumn: this.joinFromColumn(name) }));
    const ownerOf = new Map(types.map(({ ownerType, type }) => [type, ownerType]));
    const depth = (type: string): number => {
      const owner = ownerOf.get(type);
      return owner ? depth(owner) + 1 : 0;
    };
    const tracked = new Set([
      ...types.flatMap(({ ownerType }) => (ownerType ? [ownerType] : [])),
      ...joins.map(({ from }) => from),
    ]);
    const properties = new Set(this.propertyTypes());
    this.schema = {
      // An owner before the kinds it owns, each in its declared order otherwise
      kinds: types
        .toSorted((a, b) => depth(a.type) - depth(b.type))
        .map(({ ownerType, type }) => ({
          type,
          customizable: this.kind(type).customizable ?? false,
          properties: properties.has(type),
          ...(ownerType
            ? { owner: { column: this.ownerColumn(type), position: this.positionColumn(type), type: ownerType } }
            : {}),
          tracked: tracked.has(type),
          lists: Object.entries(this.kind(type).lists ?? {}).map(([name, list]) => ({
            name,
            target: list.target,
            from: this.joinColumn(list.join, "from", "from-entity"),
            to: this.joinColumn(list.join, "to", "target"),
            toType: this.join(list.join).to,
          })),
        })),
      joins,
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
