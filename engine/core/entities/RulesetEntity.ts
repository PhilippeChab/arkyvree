import { z } from "zod";

import {
  type EntityForm,
  Field,
  type FieldCodec,
  type Fields,
  type FieldsWrite,
  type FieldValues,
  FormColumns,
  type FormField,
  type NoFields,
  type PartialFieldValues,
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
  LinkWrite,
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
 * A form as its kind reads it, where it stores it: its name and its description, its columns' and its own fields by the
 * stored field that keeps each (`fields`), its columns' links by role (`links`: a single link's target, a list of links'
 * entries), and its place among its owner's (`position`, an owned entity's).
 */
export interface FormBody {
  description?: string | null;
  fields: Readonly<Record<string, unknown>>;
  links: Readonly<Record<string, unknown>>;
  name: string;
  position?: number;
}

/** A form's columns as its save writes them, where they're stored: its name, its description, its fields, its links. */
export interface FormColumnValues {
  description?: string | null;
  fields: Record<string, FieldValue | null | undefined>;
  links: Record<string, string | null | undefined>;
  name?: string;
}

/** An action a kind may have none of: its writes, its groups, its copies. */
export type EntityAction = "create" | "delete" | "duplicate" | "groups" | "templates" | "update" | "variants";

/** The actions of a kind's copies. */
const COPY_ACTIONS: readonly EntityAction[] = ["duplicate", "templates", "variants"];

/** Whether a column is a list of links: its links of a role, many. */
function isLinkList(column: FormField) {
  return ["amounts", "grants", "leveledLinks", "links"].includes(column.input);
}

/** A form's part (`part`: its fields, its links) as it's given: an object, none when it gives none. */
function partOf(form: EntityForm, part: "fields" | "links"): Record<string, unknown> {
  const given: unknown = form[part];
  return typeof given === "object" && given !== null && !Array.isArray(given) ? { ...given } : {};
}

/** A column's place in its form: its stored field's (`fields`), or its link's role's (`links`). */
function placeOf(column: FormField): { at: string; part: "fields" | "links" } | undefined {
  if (column.input === "group") return undefined;
  if (column.field !== undefined) return { at: column.field, part: "fields" };
  return column.role === undefined ? undefined : { at: column.role, part: "links" };
}

/**
 * A ruleset's entity kind (its type, `type`), as its rules answer the server of it in a ruleset's view. Every kind
 * takes the same steps, and adds its rules to the ones they name:
 * - an entity found by its id (`find`) and described (`describe`): as the view composes it (its own columns, its fields
 *   as its codec reads them, by the stored field that keeps each, an item's template's it holds none of among them,
 *   `fieldsHeldBy`; its single links each with its target's name), its fields as its form shows them
 *   (`describeFields`);
 * - a page of its records (`openList`): its query's filters read by their schemas (`listFilters`, each by the field,
 *   the role or the partition it filters), what the server reads it with (`filters`, `listOf`), and its records
 *   described alike; its groups, a kind's that lists by group (`openGroups`: `groupFilters`, `groupsOf`);
 * - what its form writes (`planCreate`, `planEdit`), its form being where it stores it (its fields by the stored field
 *   that keeps each, its links by role): its columns read by their descriptions (`columns`, its rules', each at its
 *   field or its role), and its own fields past them (`ownFields`), the entities it names by id, as the view reads them
 *   (`resolveIds`: a copy's for its source's id, refused, naming it, when the view shows none), the fields the form
 *   gives, read by its codec against the ruleset's declarations of them (`FieldCodec.parse`), the form checked
 *   (`checkForm`), its form's columns (`columnsOf`), written where they're stored (`storedOf`), its fields with them
 *   (`fieldsWrite`), the links it sets (`linksOf`), and what it writes beside them (`writesOf`: the feats it makes);
 * - what deleting one writes (`planDelete`): checked (`checkDelete`), and what it writes with it (`deleteWritesOf`).
 * An action a kind has none of it refuses as not found (`checkAction`): a read-only kind's writes (`readOnly`: "No
 * create for abilities"), the groups of a kind that lists none, a duplicate, variants and templates of a kind that makes
 * no copies (`copies`: "No templates for races").
 */
export default abstract class RulesetEntity<K extends keyof ViewKinds, S extends Fields = NoFields> {
  constructor(protected readonly view: RulesetView) {}

  /** Its form's columns, as its rules describe them (`RulesDescription.columns`): none of its own. */
  protected readonly columns: readonly FormField[] = [];

  /** Whether it makes copies of its entities: their templates, a duplicate, variants (an item's). */
  protected readonly copies: boolean = false;

  /** The fields its entities hold, as its module declares them: `FieldCodec.NONE`, none. */
  protected abstract readonly fields: FieldCodec<S>;

  /** Its groups' filters, by query key: none, a kind that lists by group alone has them (a feat's pool). */
  protected readonly groupFilters?: z.ZodRawShape;

  /** What a refusal calls one: "Save" in "Save not found in this ruleset". */
  protected abstract readonly label: string;

  /**
   * Its list's filters past the shared ones, each by the field, the role or the partition it filters (`partition`), and
   * its value's schema (a race's partition, a feat's pool by its `listedIn` role): none.
   */
  protected readonly listFilters: z.ZodRawShape = {};

  /** The fields its form gives past its columns' and its fields', by stored field (an item's template flag): none. */
  protected readonly ownFields: z.ZodRawShape = {};

  /** Whether its ruleset reads it but never writes it (its rules seed it: an ability), which refuses its writes. */
  protected readonly readOnly: boolean = false;

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
   * What an edit's activity compares (`columns`, its form's, and `entity`, the one edited): their values by where
   * they're stored (its name, its description, its fields by stored field, its single links by role), in its form's
   * order (its columns' as described, then its own), the entity's at the form's places (none: null).
   */
  private changesOf(
    columns: FormColumnValues,
    entity: Pick<EntityRecord, "description" | "name"> & Pick<ViewEntity, "fields" | "links">,
  ) {
    const described = this.columns.flatMap((column) => placeOf(column)?.at ?? []);
    const order = (keys: string[]) => [...new Set([...described.filter((key) => keys.includes(key)), ...keys])];
    const after: Record<string, unknown> = { name: columns.name, description: columns.description };
    const before: Record<string, unknown> = { name: entity.name, description: entity.description };
    for (const key of order([...Object.keys(columns.fields), ...Object.keys(columns.links)])) {
      const isField = Object.hasOwn(columns.fields, key);
      after[key] = isField ? columns.fields[key] : columns.links[key];
      before[key] = (isField ? entity.fields[key] : entity.links[key]) ?? null;
    }
    return { after, before };
  }

  /** The stored fields and the roles a form's columns and its own fields take, which its codec doesn't read. */
  private get formPlaces(): { fields: Set<string>; links: Set<string> } {
    const columns = this.columns.flatMap((column) => placeOf(column) ?? []);
    return {
      fields: new Set([
        ...columns.flatMap(({ at, part }) => (part === "fields" ? [at] : [])),
        ...Object.keys(this.ownFields),
      ]),
      links: new Set(columns.flatMap(({ at, part }) => (part === "links" ? [at] : []))),
    };
  }

  /** The stored fields and the roles its form and its list's query name (its columns', its fields', its own). */
  private get places(): { fields: Set<string>; roles: Set<string> } {
    const leaves = Field.leavesOf(this.fields.fields);
    const columns = this.columns.flatMap((column) => placeOf(column) ?? []);
    return {
      fields: new Set([
        ...leaves.flatMap((leaf) => (leaf.kind === "ref" ? [] : [leaf.field])),
        ...columns.flatMap(({ at, part }) => (part === "fields" ? [at] : [])),
        ...Object.keys(this.ownFields),
      ]),
      roles: new Set([
        ...leaves.flatMap((leaf) => (leaf.kind === "ref" ? [leaf.role] : [])),
        ...columns.flatMap(({ at, part }) => (part === "links" ? [at] : [])),
      ]),
    };
  }

  /**
   * What a form writes (its row: its columns where they're stored, `storedOf`, and its fields, `fieldsWrite`), and what
   * its save answers once written (`describe`: its record, its fields as a read gives them, the links a read describes
   * of it named, `savedLinks`).
   */
  private planWrite(
    body: FormBody,
    given: PartialFieldValues<S>,
    entity?: ViewKinds[K],
  ): EntityCreatePlan & { columns: FormColumnValues } {
    const columns = this.columnsOf(body, entity);
    const row = this.storedOf(columns);
    const written = this.fieldsWrite(body, given, entity);
    return {
      columns,
      describe: (saved, links) => ({
        ...saved,
        fields: this.fields.readByField(this.rulesetData.withInheritedFields(this.type, saved)),
        links: this.rulesetData.nameLinks(this.savedLinks(saved, links)),
      }),
      links: this.linksOf(body),
      row: written
        ? { ...row, fields: { ...row.fields, ...written.fields }, links: { ...row.links, ...written.links } }
        : row,
      writes: this.writesOf(body, given, entity),
    };
  }

  /**
   * The fields a form gives past its columns and its own (`form`: those of its fields and its links the kind's codec
   * reads), read by the kind's codec, those it gives (none when it gives none): refused as invalid, by field, as a
   * route's validation refuses a body, when one isn't a field its kind declares, of its field's type, in its bounds or
   * among its values, or names an entity the view shows none of. A reference reads as the id the view keys its entity
   * by. A kind that holds no fields refuses any its form gives past its columns alike.
   */
  private readFields(form: EntityForm, entity?: ViewKinds[K]): PartialFieldValues<S> {
    const taken = this.formPlaces;
    const rest = (part: "fields" | "links") =>
      Object.fromEntries(Object.entries(partOf(form, part)).filter(([key]) => !taken[part].has(key)));
    if (!this.rulesetData.takesFields(this.type)) {
      const unknown = (["fields", "links"] as const).flatMap((part) =>
        Object.keys(rest(part)).map((key) => ({ category: `${part}.${key}`, message: "Not a field of this entity" })),
      );
      if (unknown.length > 0) throw new RulesError("invalid", "Request validation failed", unknown);
      return {};
    }
    if (form.fields === undefined && form.links === undefined) return {};
    return this.fields.parse(
      { fields: rest("fields"), links: rest("links") },
      { kept: entity && this.fieldsOf(entity), resolve: (type, id) => this.ids.resolve(type, id) },
    );
  }

  /**
   * A query's filters (`given`) read by their schemas (`shape`, the list's or the groups'): refused as invalid, by key,
   * as a route's validation refuses a query, when one isn't the kind's ("races take no tier filter") or isn't of its
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
  protected checkForm(_body: FormBody, _entity?: ViewKinds[K]) {}

  /**
   * A form's columns (`entity`: the one edited, none for a new one), where they're stored: its name, its description,
   * its columns' and its own fields, and its columns' single links, as it gives them.
   */
  protected columnsOf(body: FormBody, _entity?: ViewKinds[K]): FormColumnValues {
    const singles = new Set(
      this.columns.flatMap((column) => {
        const place = placeOf(column);
        return !isLinkList(column) && place?.part === "links" ? [place.at] : [];
      }),
    );
    return {
      description: body.description,
      fields: { ...body.fields } as FormColumnValues["fields"],
      links: Object.fromEntries(
        Object.entries(body.links).filter(([role]) => singles.has(role)),
      ) as FormColumnValues["links"],
      name: body.name,
    };
  }

  /** What deleting an entity writes with it: nothing, unless its kind's rules say. */
  protected deleteWritesOf(_entity: ViewKinds[K]): EntityWrites | undefined {
    return undefined;
  }

  /**
   * Entities as stored (`rows`: records, or the view's), each with its fields as its codec reads them, as the view
   * composes them (`fieldsHeldBy`), and its single links as the view composes them, each with its target's name
   * (`links`).
   */
  protected describeRows<T extends Pick<EntityRecord, "fields" | "id" | "links">>(
    rows: T[],
  ): (Omit<T, "fields" | "links"> & { fields: Record<string, unknown>; links: NamedLink[] })[] {
    return rows.map((row) => ({
      ...row,
      fields: this.fieldsHeldBy(row),
      links: this.rulesetData.nameLinks(this.rulesetData.linksOf(row.id).filter((link) => link.role in row.links)),
    }));
  }

  /**
   * An entity's fields as a read answers them (`entity`: a record, or the view's), each as its codec reads it, by the
   * stored field that keeps it (`FieldCodec.readByField`): the view's, its sibling copies' merged in, with those it
   * reads off another when it holds none (an item's, its template's); a record's own where the view shows none of it.
   */
  protected fieldsHeldBy(entity: Pick<EntityRecord, "fields" | "id" | "links">): Record<string, unknown> {
    const viewed: Pick<ViewEntity, "fields" | "links"> = this.rulesetData.find(this.type, entity.id) ?? entity;
    return this.fields.readByField(this.rulesetData.withInheritedFields(this.type, viewed));
  }

  /**
   * An entity's fields read by its codec (`entity`, as the view has it: those it reads off another when it holds none
   * among them, an item's template's), a reference the id the view keys its entity by (a copy's).
   */
  protected fieldsOf(entity: Pick<ViewEntity, "fields" | "links">): FieldValues<S> {
    const values = this.fields.read(this.rulesetData.withInheritedFields(this.type, entity));
    return this.fields.resolveReferences(values, (id) => this.rulesetData.cow.resolve(id));
  }

  /**
   * The fields a form writes (`given`: those it gives, read; `entity`: the one edited), with the links its references
   * set: those it gives over those the entity keeps (`formFields`); none when it gives none.
   */
  protected fieldsWrite(_body: FormBody, given: PartialFieldValues<S>, entity?: ViewKinds[K]): FieldsWrite | undefined {
    const fields = this.formFields(given, entity);
    return fields && this.fields.write(fields);
  }

  /**
   * What the server reads the kind's entities by, of the values given (`given`: a list's query's, its templates'), each
   * by what it filters: a stored field's value, a single link's targets by its role, a partition (`partition`).
   */
  protected filtersOf(given: Readonly<Record<string, unknown>>): EntityFilters {
    const { fields: stored, roles } = this.places;
    const filters: { fields?: Record<string, FieldValue>; links?: Record<string, string[]>; partitions?: string[] } =
      {};
    for (const [key, value] of Object.entries(given)) {
      if (value === undefined) continue;
      if (key === "partition") filters.partitions = [String(value)];
      else if (stored.has(key)) (filters.fields ??= {})[key] = value as FieldValue;
      else if (roles.has(key)) (filters.links ??= {})[key] = Array.isArray(value) ? value : [String(value)];
      else throw new Error(`${getUrlSegment(this.type)} store nothing at ${key}`);
    }
    return filters;
  }

  /**
   * The fields a form writes, of those its form shows: the ones it gives over the edited entity's (a new one's
   * defaults). None when the form gives none: an edit keeps those it has, and a new entity keeps none.
   */
  protected formFields(given: PartialFieldValues<S>, entity?: ViewKinds[K]) {
    if (this.fields.formNames.every((key) => given[key] === undefined)) return undefined;
    return this.fields.merge(entity ? this.fieldsOf(entity) : this.fields.defaults, given);
  }

  /**
   * A form as its kind reads it (`entity`: the one edited, none for a new one): its name, its description and its
   * position as its route carries them, its columns read by their descriptions at their places (`FormColumns`: a
   * field's among its fields, a link's among its links) and its own fields (`ownFields`), refused as invalid, by place,
   * as a route's validation refuses a body. The fields and links its codec reads it leaves out (`readFields`).
   */
  protected formOf(form: EntityForm, entity?: ViewKinds[K]): FormBody {
    const shapes = FormColumns.shapes(this.columns, !entity);
    const pick = (part: "fields" | "links", shape: z.ZodRawShape) =>
      Object.fromEntries(Object.entries(partOf(form, part)).filter(([key]) => Object.hasOwn(shape, key)));
    const fieldShape = { ...shapes.fields, ...this.ownFields };
    return {
      description: form.description,
      fields: RulesError.parse(z.object(fieldShape), pick("fields", fieldShape), ["fields"]),
      links: RulesError.parse(z.object(shapes.links), pick("links", shapes.links), ["links"]),
      name: form.name ?? "",
      position: form.position,
    };
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
   * The links a form sets on the entity, by role (a feat's pools, a class level's grants): each list of links its
   * columns describe that it gives, of its column's kind (`references`), its entries as they are; a role it leaves out
   * is kept (none given: `undefined`, an edit's every one).
   */
  protected linksOf(body: FormBody): LinkSet[] | undefined {
    const sets = this.columns.flatMap((column): LinkSet[] => {
      if (!isLinkList(column) || !("references" in column) || column.role === undefined) return [];
      const links = body.links[column.role];
      return Array.isArray(links)
        ? [{ links: links as Omit<LinkWrite, "role" | "toType">[], role: column.role, toType: column.references }]
        : [];
    });
    return sets.length > 0 ? sets : undefined;
  }

  /**
   * A page of the kind's records, of the filters its query gives (`where`, read): what the server reads it with
   * (`filters`: the ruleset's entities, of the values its query gives, by the field, the role or the partition each
   * filters; a kind's list may narrow them by ids or the links of a role from a kind that name them, `linkedBy`), and
   * its records described.
   */
  protected listOf({ childOnly: _, ...where }: { childOnly?: boolean } & Record<string, unknown>) {
    const filters: EntityFilters & { ids?: string[]; linkedBy?: { fromType: string; role: string } } =
      this.filtersOf(where);
    return {
      describe: <T extends Pick<EntityRecord, "fields" | "id" | "links">>(rows: T[]) => this.describeRows(rows),
      filters,
    };
  }

  /**
   * The entities a form names by id (`body`, its columns' links), each the one the view shows (`ids`: a copy's for its
   * source's id), as the links that replace the form's as it enters (`planCreate`, `planEdit`): a single link's target,
   * a list of links' targets (refused when it names one twice, by its source's id and its copy's). Refused, naming one
   * the view shows none of.
   */
  protected resolveIds(body: FormBody): FormBody["links"] {
    const resolved: Record<string, unknown> = { ...body.links };
    for (const column of this.columns) {
      const role = column.input === "group" ? undefined : column.role;
      const value = role === undefined ? undefined : body.links[role];
      if (role === undefined || value === undefined || value === null) continue;
      const type = (
        column.input === "template" ? this.type : "references" in column ? column.references : ""
      ) as keyof ViewKinds;
      if (typeof value === "string") {
        resolved[role] = value ? this.ids.resolve(type, value) : value;
      } else if (Array.isArray(value) && column.input !== "grants") {
        const toIds = this.ids.resolveAll(
          type,
          value.map((entry: { toId: string }) => entry.toId),
        );
        resolved[role] = value.map((entry: object, index) => ({ ...entry, toId: toIds[index] }));
      }
    }
    return resolved;
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
   * What a form's columns (`columns`, where they're stored) write of its entity's row: its name and its description,
   * its fields and its single links. A value it leaves out (undefined) it keeps; null clears it.
   */
  protected storedOf(columns: FormColumnValues): EntityWrite {
    const given = <V>(values: Record<string, V | undefined>) =>
      Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as Record<string, V>;
    const fields = given(columns.fields);
    const links = given(columns.links);
    return {
      ...(columns.name !== undefined && { name: columns.name }),
      ...(columns.description !== undefined && { description: columns.description }),
      ...(Object.keys(fields).length > 0 && { fields }),
      ...(Object.keys(links).length > 0 && { links }),
    };
  }

  /**
   * What a form writes beside the row (`given`: the fields it gives, read; `entity`: the one edited): nothing, unless
   * its kind's rules say (the feats it makes).
   */
  protected writesOf(_body: FormBody, _given: PartialFieldValues<S>, _entity?: ViewKinds[K]): EntityWrites | undefined {
    return undefined;
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
   * An entity as its page shows it: as the view has it (its own columns, its fields, an item's template's it holds none
   * of among them, its single links each with its target's name).
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
   * A new entity's row off its form, and what it writes beside it. Named as an ancestor its ruleset deleted
   * (`ancestor`, its stored record, which the view hides), it stands in for it: its kind may take after it.
   */
  planCreate(sent: EntityForm, _ancestor?: EntityRecord): EntityCreatePlan {
    this.checkAction("create");
    const body = this.formOf(sent);
    const form: FormBody = { ...body, links: this.resolveIds(body) };
    const given = this.readFields(sent);
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
  planDuplicate(_sourceId: string, _sent: EntityForm): EntityCreatePlan {
    return this.refuseAction("duplicate");
  }

  /**
   * An entity's edit (`id`): the entity as the view has it, its new row off its form (an edit leaves the columns and the
   * fields it doesn't give as they are), what it writes beside it, and what its activity compares (`changes`: the
   * entity's values and the form's columns, by where they're stored: `changesOf`).
   */
  planEdit(id: string, sent: EntityForm): EntityEditPlan<ViewKinds[K]> {
    this.checkAction("update");
    const entity = this.find(id);
    const body = this.formOf(sent, entity);
    const form: FormBody = { ...body, links: this.resolveIds(body) };
    const given = this.readFields(sent, entity);
    this.checkForm(form, entity);
    const { columns, ...plan } = this.planWrite(form, given, entity);
    return { ...plan, changes: this.changesOf(columns, entity), entity };
  }

  /** Copies of an entity (`sourceId`), each its own name and description: none, unless its kind makes copies. */
  planVariants(_sourceId: string, _variants: { description?: string | null; name: string }[]): EntityCopiesPlan {
    return this.refuseAction("variants");
  }
}
