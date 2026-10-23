import { z } from "zod";

import {
  type EntityForm,
  type FieldCodec,
  type Fields,
  type FieldValues,
  FormColumns,
  type FormField,
  type NoFields,
} from "@/engine/core/fields/index.ts";
import type {
  EntityCopiesPlan,
  EntityCreatePlan,
  EntityDeletePlan,
  EntityEditPlan,
  EntityWrites,
  ListLink,
  PropertyValue,
} from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import { RequestIds, type RulesetData, type RulesetView, type ViewEntities } from "@/engine/core/view/index.ts";
import { PROPERTY_ENTITY_TYPES } from "@/shared/customization/entities.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import type { Property } from "@/shared/relations.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

/**
 * A ruleset's entity kind (its table, `type`), as its rules answer the server of it in a ruleset's view. Every kind
 * takes the same steps, and adds its rules to the ones they name:
 * - an entity found by its id (`find`) and described (`describe`): its row as the view resolves it, with the fields its
 *   properties hold (`fields`), as its form shows them (`describeFields`);
 * - a page of its rows (`openList`): its query's filters read by their schemas (`listFilters`), what the server reads
 *   it with (`filters`, `listOf`), and its rows described alike; its groups, a kind's that lists by group
 *   (`openGroups`: `groupFilters`, `groupsOf`);
 * - what its form writes (`planCreate`, `planEdit`): its columns read by their descriptions (`columns`, its rules'), and
 *   what else it carries by its kind's keys (`formKeys`), the entities it names by id, as the view reads them (`resolveIds`:
 *   a copy's for its source's id, refused, naming it, when the view shows none), the fields the form gives, read by its
 *   codec against the ruleset's declarations of them (`FieldCodec.parse`), the form checked (`checkForm`), its row's
 *   columns (`columnsOf`), the lists it's linked to (`linksOf`), what it writes beside them (`writesOf`: its fields,
 *   the feats it makes), and the fields it keeps once written (`fields`, which a create or an edit answers with its
 *   row);
 * - what deleting one writes (`planDelete`): checked (`checkDelete`), and what it writes with it (`deleteWritesOf`).
 * A kind its ruleset reads but never writes refuses its writes (`readOnly`), and one that makes no copies refuses a
 * duplicate, variants and templates, each as not found: "No create for abilities".
 */
export default abstract class RulesetEntity<
  K extends keyof ViewEntities,
  Body extends object,
  Columns extends object = Body,
  S extends Fields = NoFields,
> {
  constructor(protected readonly view: RulesetView) {}

  /** Its form's columns, as its rules describe them (`RulesDescription.columns`): none of its own. */
  protected readonly columns: readonly FormField[] = [];

  /** The fields its properties hold: `FieldCodec.NONE`, none of its own. */
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

  /** Whether its ruleset reads it but never writes it (3.5's abilities), which refuses a create, an edit, a delete. */
  protected readonly readOnly: boolean = false;

  /** The kind's table. */
  abstract readonly type: K;

  /** A form's columns: the ones the kind's row takes (`entity`: the one edited, none for a new one). */
  protected abstract columnsOf(body: Body, entity?: ViewEntities[K]): Columns;

  /** What a form writes, and the fields the entity keeps (`fields`, which a create or an edit answers with its row). */
  private planWrite(
    body: Body,
    given: Partial<FieldValues<S>>,
    entity?: ViewEntities[K],
  ): EntityCreatePlan<Columns, FieldValues<S>> {
    const columns = this.columnsOf(body, entity);
    const writes = this.writesOf(body, given, entity);
    const fields = this.fields.read(this.writtenProperties(columns, writes?.properties?.values, entity));
    return { columns, fields, links: this.linksOf(body), writes };
  }

  /**
   * The fields a form gives (its `fields`, which the route carries as it is), read by the kind's codec, those it gives
   * (none when it gives none): refused as invalid, by field, as a route's validation refuses a body, when one isn't a
   * field its kind declares, of its field's type, in its bounds or among its values, or names an entity the view shows
   * none of. A reference reads as the id the view keys its entity by.
   */
  private readFields(body: Body, entity?: ViewEntities[K]): Partial<FieldValues<S>> {
    const given = "fields" in body ? body.fields : undefined;
    if (!isOneOf(this.type, PROPERTY_ENTITY_TYPES)) return {};
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
  private refuseAction(words: string): never {
    throw new RulesError("not-found", `No ${words} for ${getUrlSegment(this.type)}`);
  }

  /** Refuses deleting an entity: nothing does, unless its kind's rules say. */
  protected checkDelete(_entity: ViewEntities[K]) {}

  /** Refuses a form (`entity`: the one edited, none for a new one): nothing does, unless its kind's rules say. */
  protected checkForm(_body: Body, _entity?: ViewEntities[K]) {}

  /** What deleting an entity writes with it: nothing, unless its kind's rules say. */
  protected deleteWritesOf(_entity: ViewEntities[K]): EntityWrites | undefined {
    return undefined;
  }

  /** Rows as the view resolves them (a stored id, its copy or winner), each with the fields its properties hold. */
  protected describeRows<T extends Record<string, unknown> & { id: string }>(rows: T[]): (T & FieldValues<S>)[] {
    return this.rulesetData.cow.resolveRows(rows).map((row) => ({ ...row, ...this.fieldsOf(row) }));
  }

  /** The fields an entity's properties hold, a reference the id the view keys its entity by (a copy's). */
  protected fieldsOf(entity: { id: string }): FieldValues<S> {
    const values = this.fields.read(this.propertiesOf(entity));
    return this.fields.resolveReferences(values, (id) => this.rulesetData.cow.resolve(id));
  }

  /**
   * The fields a form writes: the ones it gives over the edited entity's (a new one's defaults). None when the form
   * gives none: an edit keeps those it has, and a new entity keeps none.
   */
  protected formFields(given: Partial<FieldValues<S>>, entity?: ViewEntities[K]) {
    if (this.fields.keys.every((key) => given[key] === undefined)) return undefined;
    return this.fields.merge(entity ? this.fieldsOf(entity) : this.fields.defaults, given);
  }

  /**
   * A form as its kind reads it (`entity`: the one edited, none for a new one): its name, its description and its
   * fields as its route carries them, its columns read by their descriptions (`FormColumns`) and what else it carries
   * by its kind's keys (`formKeys`), refused as invalid, by key, as a route's validation refuses a body.
   */
  protected formOf(form: EntityForm, entity?: ViewEntities[K]): Body {
    const { description, fields, name } = form;
    const schema = FormColumns.schema(this.columns, !entity).extend(this.formKeys);
    // Every key `Body` names is read: its route's, its columns' and its kind's own
    return { description, fields, name, ...RulesError.parse(schema, form) } as Body;
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
   * The properties a written entity's fields are read off when its form writes none: the edited one's, none for a new
   * one (an item's, its template's).
   */
  protected keptProperties(_columns: Columns, entity?: ViewEntities[K]): Property[] {
    return entity ? this.propertiesOf(entity) : [];
  }

  /** The lists a form links the entity to: none (`undefined`, an edit's kept), unless its kind is listed. */
  protected linksOf(_body: Body): ListLink[] | undefined {
    return undefined;
  }

  /**
   * A page of the kind's rows, of the filters its query gives (`where`, read): what the server reads it with
   * (`filters`: the ruleset's rows, of the values its query gives of its list's columns; a kind's list may narrow them
   * by ids, fields or the join that links them), and its rows described.
   */
  protected listOf(where: { childOnly?: boolean } & Record<string, unknown>) {
    const named = this.listColumns.filter((name) => where[name] !== undefined);
    const filters: {
      columns?: Record<string, unknown>;
      fields?: Record<string, string>;
      ids?: string[];
      joinedBy?: string;
    } = named.length === 0 ? {} : { columns: Object.fromEntries(named.map((name) => [name, where[name]])) };
    return {
      describe: <T extends Record<string, unknown> & { id: string }>(rows: T[]) => this.describeRows(rows),
      filters,
    };
  }

  /** The properties an entity's fields are read off: its own (an item's, merged with its template's). */
  protected propertiesOf(entity: { id: string }): Property[] {
    return this.rulesetData.propertiesByEntity.get(entity.id) ?? [];
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
   * What a form writes beside the row (`given`: the fields it gives, read; `entity`: the one edited): its fields, those
   * it gives over those the entity keeps, which replace their properties; nothing when it gives none. Its kind's rules
   * add theirs (the feats it makes).
   */
  protected writesOf(_body: Body, given: Partial<FieldValues<S>>, entity?: ViewEntities[K]): EntityWrites | undefined {
    const fields = this.formFields(given, entity);
    return fields && { properties: this.fields.write(fields) };
  }

  /**
   * The properties a written entity's fields are read off: those its form writes (`written`), or, when it writes none,
   * those it keeps (`keptProperties`).
   */
  protected writtenProperties(columns: Columns, written: PropertyValue[] | undefined, entity?: ViewEntities[K]) {
    return written ?? this.keptProperties(columns, entity);
  }

  /** An entity as its page shows it: its row as the view resolves it, with the fields its properties hold. */
  describe(id: string) {
    return this.describeRows([this.find(id)])[0];
  }

  /** The fields its form shows, as the ruleset declares them: their labels, their inputs and their options. */
  describeFields(): FormField[] {
    if (!isOneOf(this.type, PROPERTY_ENTITY_TYPES)) return [];
    return this.fields.describe();
  }

  /** The entity the view shows for an id: refused when it shows none. */
  find(id: string): ViewEntities[K] {
    const entity = this.rulesetData.find(this.type, id);
    if (!entity) throw new RulesError("not-found", `${this.label} not found in this ruleset`);
    return entity;
  }

  /**
   * A page of the kind's groups, as its query asks for it (`given`: its filters, read by `groupFilters`): what the
   * server reads it with (`groupFilters`). Refused as not found for a kind that lists no groups.
   */
  openGroups({ childOnly, ...given }: { childOnly?: boolean } & Record<string, unknown>) {
    if (!this.groupFilters) this.refuseAction("groups");
    return this.groupsOf({ childOnly, ...this.readFilters(this.groupFilters, given) });
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
  openTemplates(_type?: string): { filters: { columns: Record<string, unknown> } } {
    return this.refuseAction("templates");
  }

  /**
   * A new entity's row off its form, what it writes beside it, and the fields it keeps once written. Named as an
   * ancestor its ruleset deleted (`ancestor`, its stored row, which the view hides), it stands in for it: its kind may
   * take after it.
   */
  planCreate(sent: EntityForm, _ancestor?: Record<string, unknown>): EntityCreatePlan<Columns, FieldValues<S>> {
    if (this.readOnly) this.refuseAction("create");
    const body = this.formOf(sent);
    const form: Body = { ...body, ...this.resolveIds(body) };
    const given = this.readFields(form);
    this.checkForm(form);
    return this.planWrite(form, given);
  }

  /** Deleting an entity (`id`): the entity as the view has it, and what its delete writes with it. */
  planDelete(id: string): EntityDeletePlan<ViewEntities[K]> {
    if (this.readOnly) this.refuseAction("delete");
    const entity = this.find(id);
    this.checkDelete(entity);
    return { entity, writes: this.deleteWritesOf(entity) };
  }

  /** A copy of an entity (`sourceId`) off its form: none, unless its kind makes copies. */
  planDuplicate(_sourceId: string, _sent: EntityForm): EntityCreatePlan<Columns, FieldValues<S>> {
    return this.refuseAction("duplicate");
  }

  /**
   * An entity's edit (`id`): the entity as the view has it, its new row off its form (an edit leaves the columns it
   * doesn't give as they are), what it writes beside it, and the fields it keeps once written.
   */
  planEdit(id: string, sent: EntityForm): EntityEditPlan<Columns, FieldValues<S>, ViewEntities[K]> {
    if (this.readOnly) this.refuseAction("update");
    const entity = this.find(id);
    const body = this.formOf(sent, entity);
    const form: Body = { ...body, ...this.resolveIds(body) };
    const given = this.readFields(form, entity);
    this.checkForm(form, entity);
    return { ...this.planWrite(form, given, entity), entity };
  }

  /** Copies of an entity (`sourceId`), each its own name and description: none, unless its kind makes copies. */
  planVariants(
    _sourceId: string,
    _variants: { description?: string | null; name: string }[],
  ): EntityCopiesPlan<Columns> {
    return this.refuseAction("variants");
  }
}
