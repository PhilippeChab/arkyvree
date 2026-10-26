import { z } from "zod";

import {
  type EntityForm,
  type FieldCodec,
  type Fields,
  type FieldsWrite,
  type FieldValues,
  FormColumns,
  type FormField,
  type NoFields,
  OwnerValues,
  type StoredValues,
} from "@/engine/core/fields/index.ts";
import type {
  EntityCopiesPlan,
  EntityCreatePlan,
  EntityDeletePlan,
  EntityEditPlan,
  EntityFilters,
  EntityRecord,
  EntityWrite,
  EntityWrites,
  FieldValue,
  LinkSet,
} from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import {
  type NamedLink,
  RequestIds,
  type RulesetData,
  type RulesetView,
  type ViewEntity,
  type ViewKinds,
  type ViewLink,
} from "@/engine/core/view/index.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

/**
 * Where a kind stores the value its form or its list's query gives at a key (`StoredAt`): its entity's own field, its
 * single link of a role, or its partition.
 */
type StoredAt = "partition" | { field: string } | { role: string };

/** An action a kind may have none of: its writes, its groups, its copies. */
export type EntityAction = "create" | "delete" | "duplicate" | "groups" | "templates" | "update" | "variants";

/** The actions of a kind's copies. */
const COPY_ACTIONS: readonly EntityAction[] = ["duplicate", "templates", "variants"];

/**
 * A ruleset's entity kind (its type, `type`), as its rules answer the server of it in a ruleset's view. Every kind
 * takes the same steps, and adds its rules to the ones they name:
 * - an entity found by its id (`find`) and described (`describe`): as stored (its own columns, its own fields, its
 *   single links each with its target's name), with the fields its stored values hold (`fields`), as its form shows them
 *   (`describeFields`);
 * - a page of its records (`openList`): its query's filters read by their schemas (`listFilters`), what the server
 *   reads it with (`filters`, `listOf`: those of its columns, by where it stores them), and its records described
 *   alike; its groups, a kind's that lists by group (`openGroups`: `groupFilters`, `groupsOf`);
 * - what its form writes (`planCreate`, `planEdit`): its columns read by their descriptions (`columns`, its rules'), and
 *   what else it carries by its kind's keys (`formKeys`), the entities it names by id, as the view reads them (`resolveIds`:
 *   a copy's for its source's id, refused, naming it, when the view shows none), the fields the form gives, read by its
 *   codec against the ruleset's declarations of them (`FieldCodec.parse`), the form checked (`checkForm`), its form's
 *   columns (`columnsOf`), written where they're stored (`storedOf`: each by its description's `field` or `role`, or by
 *   `storedAt`), the links it sets (`linksOf`), what it writes beside them (`writesOf`: its fields, the feats it makes),
 *   and the fields it keeps once written (`fields`, which a create or an edit answers with its row);
 * - what deleting one writes (`planDelete`): checked (`checkDelete`), and what it writes with it (`deleteWritesOf`).
 * An action a kind has none of it refuses as not found (`checkAction`): a read-only kind's writes (`readOnly`: "No
 * create for abilities"), the groups of a kind that lists none, a duplicate, variants and templates of a kind that makes
 * no copies (`copies`: "No templates for races").
 */
export default abstract class RulesetEntity<
  K extends keyof ViewKinds,
  Body extends object,
  Columns extends object = Body,
  S extends Fields = NoFields,
> {
  constructor(protected readonly view: RulesetView) {}

  /** Its form's columns, as its rules describe them (`RulesDescription.columns`): none of its own. */
  protected readonly columns: readonly FormField[] = [];

  /** Whether it makes copies of its entities: their templates, a duplicate, variants (an item's). */
  protected readonly copies: boolean = false;

  /** The fields its entities hold: `FieldCodec.NONE`, none of its own. */
  protected abstract readonly fields: FieldCodec<S>;

  /** What its form carries past its name, its description, its fields and its columns, by key: nothing. */
  protected readonly formKeys: z.ZodRawShape = {};

  /** Its groups' filters, by query key: none, a kind that lists by group alone has them (a feat's pool). */
  protected readonly groupFilters?: z.ZodRawShape;

  /** What a refusal calls one: "Save" in "Save not found in this ruleset". */
  protected abstract readonly label: string;

  /** The columns its list's query narrows it by, a value each (a race's kind): none. */
  protected readonly listColumns: readonly string[] = [];

  /** Its list's filters past the shared ones, by query key, each its value's schema (a pool's, a level's): none. */
  protected readonly listFilters: z.ZodRawShape = {};

  /** Whether its ruleset reads it but never writes it (its rules seed it: an ability), which refuses its writes. */
  protected readonly readOnly: boolean = false;

  /**
   * Where it stores what its form or its list's query gives at a key past its columns' descriptions (a column says where
   * its own is stored, `FormField.field` or `role`): none, unless its kind has others (an item's `isTemplate`).
   */
  protected readonly storedAt: Readonly<Record<string, StoredAt>> = {};

  /**
   * The kind of the entities it owns (`owned(ownerId)`: a class's levels'), none for a kind that owns none: what a
   * delete of one reads before it finds their owner.
   */
  readonly ownedType: string | undefined = undefined;

  /**
   * Whether a new entity standing in for an ancestor its ruleset deleted takes after the ancestor's stored row (a feat
   * its mark), which the server then reads for `planCreate`.
   */
  readonly takesAfterAncestor: boolean = false;

  /** The kind's type. */
  abstract readonly type: K;

  /**
   * A form's columns, by its keys: its name, its description and the ones its kind takes (`entity`: the one edited,
   * none for a new one), each where its kind stores it (`storedOf`).
   */
  protected abstract columnsOf(body: Body, entity?: ViewKinds[K]): Columns;

  /** Where the kind stores what its form or its list's query gives, by key: its columns' and its own (`storedAt`). */
  private get keysStored(): Map<string, StoredAt> {
    const described = this.columns.flatMap((column): [string, StoredAt][] => {
      if (column.input === "group") return [];
      if (column.field) return [[column.key, { field: column.field }]];
      return (column.input === "ref" || column.input === "template") && column.role
        ? [[column.key, { role: column.role }]]
        : [];
    });
    return new Map([...described, ...Object.entries(this.storedAt)]);
  }

  /**
   * What a form writes, the fields the entity keeps (`fields`), and what its save answers once written (`describe`: its
   * record, the links a read describes of it named, `savedLinks`, and the fields it keeps).
   */
  private planWrite(
    body: Body,
    given: Partial<FieldValues<S>>,
    entity?: ViewKinds[K],
  ): EntityCreatePlan<FieldValues<S>> & { columns: Columns } {
    const columns = this.columnsOf(body, entity);
    const writes = this.writesOf(body, given, entity);
    const fields = this.fields.read(this.writtenValues(columns, writes?.fields, entity));
    return {
      columns,
      describe: (row, links) => ({
        ...row,
        links: this.rulesetData.nameLinks(this.savedLinks(row, links)),
        ...fields,
      }),
      fields,
      links: this.linksOf(body),
      row: this.storedOf(columns),
      writes,
    };
  }

  /**
   * The fields a form gives (its `fields`, which the route carries as it is), read by the kind's codec, those it gives
   * (none when it gives none): refused as invalid, by field, as a route's validation refuses a body, when one isn't a
   * field its kind declares, of its field's type, in its bounds or among its values, or names an entity the view shows
   * none of. A reference reads as the id the view keys its entity by.
   */
  private readFields(body: Body, entity?: ViewKinds[K]): Partial<FieldValues<S>> {
    const given = "fields" in body ? body.fields : undefined;
    if (!this.rulesetData.takesFields(this.type)) return {};
    return this.fields.parse(given, {
      kept: entity && this.fieldsOf(entity),
      resolve: (type, id) => this.ids.resolve(type, id),
    });
  }

  /**
   * A query's filters (`given`) read by their schemas (`shape`, the list's or the groups'): refused as invalid, by key,
   * as a route's validation refuses a query, when one isn't the kind's ("races take no level filter") or isn't of its
   * type. Every filter is optional: a list takes none.
   */
  private readFilters(shape: z.ZodRawShape, given: Record<string, unknown>): Record<string, unknown> {
    const unknown = Object.keys(given).filter((key) => !Object.hasOwn(shape, key));
    if (unknown.length > 0) {
      const issues = unknown.map((key) => ({
        category: key,
        message: `${getUrlSegment(this.type)} take no ${key} filter`,
      }));
      throw new RulesError("invalid", "Request validation failed", issues);
    }
    return RulesError.parse(z.object(shape).partial(), given);
  }

  /** Refuses an action the kind has none of (`words`, what it's called): "No templates for classes". */
  private refuseAction(words: EntityAction): never {
    throw new RulesError("not-found", `No ${words} for ${getUrlSegment(this.type)}`);
  }

  /** Refuses deleting an entity: nothing does, unless its kind's rules say. */
  protected checkDelete(_entity: ViewKinds[K]) {}

  /** Refuses a form (`entity`: the one edited, none for a new one): nothing does, unless its kind's rules say. */
  protected checkForm(_body: Body, _entity?: ViewKinds[K]) {}

  /** What deleting an entity writes with it: nothing, unless its kind's rules say. */
  protected deleteWritesOf(_entity: ViewKinds[K]): EntityWrites | undefined {
    return undefined;
  }

  /**
   * Entities as stored (`rows`: records, or the view's), each with its single links as the view composes them, each
   * with its target's name (`links`), and the fields its stored values hold.
   */
  protected describeRows<T extends Pick<EntityRecord, "id" | "links">>(
    rows: T[],
  ): (Omit<T, "links"> & FieldValues<S> & { links: NamedLink[] })[] {
    return rows.map((row) => ({
      ...row,
      links: this.rulesetData.nameLinks(this.rulesetData.linksOf(row.id).filter((link) => link.role in row.links)),
      ...this.fieldsOf(row),
    }));
  }

  /** The fields an entity's stored values hold, a reference the id the view keys its entity by (a copy's). */
  protected fieldsOf(entity: Pick<ViewEntity, "id" | "links">): FieldValues<S> {
    const values = this.fields.read(this.valuesOf(entity));
    return this.fields.resolveReferences(values, (id) => this.rulesetData.cow.resolve(id));
  }

  /**
   * What the server reads the kind's entities by, of the values given at its keys (`given`: a list's query's, its
   * templates'), each where it's stored (`storedAt`, its columns'): a field's value, a link's targets, a partition.
   */
  protected filtersOf(given: Readonly<Record<string, unknown>>): EntityFilters {
    const stored = this.keysStored;
    const filters: { fields?: Record<string, FieldValue>; links?: Record<string, string[]>; partitions?: string[] } =
      {};
    for (const [key, value] of Object.entries(given)) {
      const at = stored.get(key);
      if (value === undefined) continue;
      if (!at) throw new Error(`${getUrlSegment(this.type)} store nothing at ${key}`);
      if (at === "partition") filters.partitions = [String(value)];
      else if ("field" in at) (filters.fields ??= {})[at.field] = value as FieldValue;
      else (filters.links ??= {})[at.role] = Array.isArray(value) ? value : [String(value)];
    }
    return filters;
  }

  /**
   * The fields a form writes: the ones it gives over the edited entity's (a new one's defaults). None when the form
   * gives none: an edit keeps those it has, and a new entity keeps none.
   */
  protected formFields(given: Partial<FieldValues<S>>, entity?: ViewKinds[K]) {
    if (this.fields.keys.every((key) => given[key] === undefined)) return undefined;
    return this.fields.merge(entity ? this.fieldsOf(entity) : this.fields.defaults, given);
  }

  /**
   * A form as its kind reads it (`entity`: the one edited, none for a new one): its name, its description and its
   * fields as its route carries them, its columns read by their descriptions (`FormColumns`) and what else it carries
   * by its kind's keys (`formKeys`), refused as invalid, by key, as a route's validation refuses a body.
   */
  protected formOf(form: EntityForm, entity?: ViewKinds[K]): Body {
    const { description, fields, name } = form;
    const schema = FormColumns.schema(this.columns, !entity).extend(this.formKeys);
    // Every key `Body` names is read: its route's, its columns' and its kind's own
    return { description, fields, name, ...RulesError.parse(schema, form) } as Body;
  }

  /**
   * An entity's values by its form's keys (`entity`, as the view has it): its name, its description, and its columns'
   * and its kind's keys', each read where it's stored (none: null). What an edit's activity compares its form's with.
   */
  protected formValuesOf(
    entity: Pick<EntityRecord, "description" | "name" | "partition"> & Pick<ViewEntity, "fields" | "links">,
  ): Record<string, unknown> {
    const values: Record<string, unknown> = { name: entity.name, description: entity.description };
    for (const [key, at] of this.keysStored) {
      if (at === "partition") values[key] = entity.partition;
      else values[key] = ("field" in at ? entity.fields[at.field] : entity.links[at.role]) ?? null;
    }
    return values;
  }

  /** A page of its groups, of the filters the query gives (`where`, read): what the server reads it with. */
  protected groupsOf(_where: Record<string, unknown>): { groupFilters: { groupField: string; ids?: string[] } } {
    return this.refuseAction("groups");
  }

  /** The entities a form names by id, as the view reads them: refused, naming one it shows none of. */
  protected get ids(): RequestIds {
    return new RequestIds(this.rulesetData, "this ruleset");
  }

  /**
   * The stored values a written entity's fields are read off when its form writes none: the edited one's, none for a
   * new one (an item's, its template's).
   */
  protected keptValues(_columns: Columns, entity?: ViewKinds[K]): StoredValues {
    return entity ? this.valuesOf(entity) : OwnerValues.NONE;
  }

  /**
   * The links a form sets on the entity, by role (a feat's pools, a class level's grants): none (`undefined`, an edit's
   * kept), unless its kind's form sets some.
   */
  protected linksOf(_body: Body): LinkSet[] | undefined {
    return undefined;
  }

  /**
   * A page of the kind's records, of the filters its query gives (`where`, read): what the server reads it with
   * (`filters`: the ruleset's entities, of the values its query gives of its list's columns, where they're stored; a
   * kind's list may narrow them by ids or the links of a role from a kind that name them, `linkedBy`), and its records
   * described.
   */
  protected listOf(where: { childOnly?: boolean } & Record<string, unknown>) {
    const filters: EntityFilters & { ids?: string[]; linkedBy?: { fromType: string; role: string } } = this.filtersOf(
      Object.fromEntries(this.listColumns.map((name) => [name, where[name]])),
    );
    return {
      describe: <T extends Pick<EntityRecord, "id" | "links">>(rows: T[]) => this.describeRows(rows),
      filters,
    };
  }

  /**
   * The entities a form names by id, each the one the view shows (`ids`: a copy's for its source's id), as the fields
   * that replace the form's as it enters (`planCreate`, `planEdit`): refused, naming one the view shows none of. None,
   * unless its kind's form names one.
   */
  protected resolveIds(_body: Body): object {
    return {};
  }

  /** The ruleset's view, as its rules read it. */
  protected get rulesetData(): RulesetData {
    return this.view.rulesetData;
  }

  /**
   * Of a saved entity's own links (`links`, as stored), those its answer names, as a read describes its record
   * (`describeRows`): its single links.
   */
  protected savedLinks(row: Pick<EntityRecord, "links">, links: readonly ViewLink[]): readonly ViewLink[] {
    return links.filter((link) => link.role in row.links);
  }

  /**
   * What a form's columns (`columns`, by its keys) write of its entity's row: its name and its description, and every
   * other key where its kind stores it (`storedOf`'s keys: its own field, its single link, its partition). A key it
   * leaves out (undefined) it keeps; null clears it.
   */
  protected storedOf(columns: Columns): EntityWrite {
    const stored = this.keysStored;
    const fields: Record<string, FieldValue | null> = {};
    const links: Record<string, string | null> = {};
    const own: { description?: string | null; name?: string; partition?: string } = {};
    for (const [key, value] of Object.entries(columns)) {
      if (value === undefined) continue;
      if (key === "name" || key === "description") {
        own[key] = value as string;
        continue;
      }
      const at = stored.get(key);
      if (!at) throw new Error(`${getUrlSegment(this.type)} store nothing at ${key}`);
      if (at === "partition") own.partition = value as string;
      else if ("field" in at) fields[at.field] = value as FieldValue | null;
      else links[at.role] = value as string | null;
    }
    return {
      ...own,
      ...(Object.keys(fields).length > 0 && { fields }),
      ...(Object.keys(links).length > 0 && { links }),
    };
  }

  /** The stored values an entity's fields are read off: its own (an item's, merged with its template's). */
  protected valuesOf(entity: Pick<ViewEntity, "id" | "links">): StoredValues {
    return this.rulesetData.valuesOf(entity.id);
  }

  /**
   * What a form writes beside the row (`given`: the fields it gives, read; `entity`: the one edited): its fields, those
   * it gives over those the entity keeps, which replace its stored values; nothing when it gives none. Its kind's rules
   * add theirs (the feats it makes).
   */
  protected writesOf(_body: Body, given: Partial<FieldValues<S>>, entity?: ViewKinds[K]): EntityWrites | undefined {
    const fields = this.formFields(given, entity);
    return fields && { fields: this.fields.write(fields) };
  }

  /**
   * The stored values a written entity's fields are read off: those its form writes (`written`), or, when it writes
   * none, those it keeps (`keptValues`).
   */
  protected writtenValues(columns: Columns, written: FieldsWrite | undefined, entity?: ViewKinds[K]): StoredValues {
    return written ? OwnerValues.written(written) : this.keptValues(columns, entity);
  }

  /**
   * Refuses an action the kind has none of, as not found ("No create for abilities"): a read-only kind's create, edit
   * and delete, the groups of a kind that lists none, a duplicate, variants and templates of a kind that makes no copies.
   * What the server opens a kind with for an action, before its access and name checks.
   */
  checkAction(action: EntityAction) {
    const has =
      action === "groups"
        ? this.groupFilters !== undefined
        : COPY_ACTIONS.includes(action)
          ? this.copies
          : !this.readOnly;
    if (!has) this.refuseAction(action);
  }

  /**
   * An entity as its page shows it: as the view has it (its own columns, its own fields, its single links each with its
   * target's name), with the fields its stored values hold.
   */
  describe(id: string) {
    return this.describeRows([this.find(id)])[0];
  }

  /** The fields its form shows, as the ruleset declares them: their labels, their inputs and their options. */
  describeFields(): FormField[] {
    if (!this.rulesetData.takesFields(this.type)) return [];
    return this.fields.describe();
  }

  /**
   * The fields the form of an entity it owns of a kind (`type`: a class level's) shows, as the ruleset declares them:
   * none for a kind it doesn't own.
   */
  describeOwnedFields(_type: string): FormField[] {
    return [];
  }

  /** The entity the view shows for an id: refused when it shows none. */
  find(id: string): ViewKinds[K] {
    const entity = this.rulesetData.find(this.type, id);
    if (!entity) throw new RulesError("not-found", `${this.label} not found in this ruleset`);
    return entity;
  }

  /**
   * A page of the kind's groups, as its query asks for it (`given`: its filters, read by `groupFilters`): what the
   * server reads it with (`groupFilters`). Refused as not found for a kind that lists no groups.
   */
  openGroups({ childOnly, ...given }: { childOnly?: boolean } & Record<string, unknown>) {
    this.checkAction("groups");
    return this.groupsOf({ childOnly, ...this.readFilters(this.groupFilters ?? {}, given) });
  }

  /**
   * A page of the kind's rows, as its query asks for it (`given`: its filters past the shared ones, read by
   * `listFilters`): what the server reads it with (`filters`), and its rows described (`listOf`).
   */
  openList({ childOnly, ...given }: { childOnly?: boolean } & Record<string, unknown>) {
    return this.listOf({ childOnly, ...this.readFilters(this.listFilters, given) });
  }

  /**
   * The entities of a type others are made from (an item's templates of a type), as the server reads them (`filters`):
   * none, unless its kind makes copies.
   */
  openTemplates(_type?: string): { filters: EntityFilters } {
    return this.refuseAction("templates");
  }

  /**
   * A new entity's row off its form, what it writes beside it, and the fields it keeps once written. Named as an
   * ancestor its ruleset deleted (`ancestor`, its stored record, which the view hides), it stands in for it: its kind
   * may take after it.
   */
  planCreate(sent: EntityForm, _ancestor?: EntityRecord): EntityCreatePlan<FieldValues<S>> {
    this.checkAction("create");
    const body = this.formOf(sent);
    const form: Body = { ...body, ...this.resolveIds(body) };
    const given = this.readFields(form);
    this.checkForm(form);
    const { columns: _, ...plan } = this.planWrite(form, given);
    return plan;
  }

  /** Deleting an entity (`id`): the entity as the view has it, and what its delete writes with it. */
  planDelete(id: string): EntityDeletePlan<ViewKinds[K]> {
    this.checkAction("delete");
    const entity = this.find(id);
    this.checkDelete(entity);
    return { entity, writes: this.deleteWritesOf(entity) };
  }

  /** A copy of an entity (`sourceId`) off its form: none, unless its kind makes copies. */
  planDuplicate(_sourceId: string, _sent: EntityForm): EntityCreatePlan<FieldValues<S>> {
    return this.refuseAction("duplicate");
  }

  /**
   * An entity's edit (`id`): the entity as the view has it, its new row off its form (an edit leaves the columns it
   * doesn't give as they are), what it writes beside it, the fields it keeps once written, and what its activity
   * compares (`changes`: the entity's values and the form's columns, by the form's keys).
   */
  planEdit(id: string, sent: EntityForm): EntityEditPlan<FieldValues<S>, ViewKinds[K]> {
    this.checkAction("update");
    const entity = this.find(id);
    const body = this.formOf(sent, entity);
    const form: Body = { ...body, ...this.resolveIds(body) };
    const given = this.readFields(form, entity);
    this.checkForm(form, entity);
    const { columns, ...plan } = this.planWrite(form, given, entity);
    return {
      ...plan,
      changes: { after: columns as Record<string, unknown>, before: this.formValuesOf(entity) },
      entity,
    };
  }

  /** Copies of an entity (`sourceId`), each its own name and description: none, unless its kind makes copies. */
  planVariants(_sourceId: string, _variants: { description?: string | null; name: string }[]): EntityCopiesPlan {
    return this.refuseAction("variants");
  }
}
