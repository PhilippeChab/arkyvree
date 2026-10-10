import type { z } from "zod";

import type { FieldCodec, Fields, FieldValues, NoFields } from "@/engine/core/fields/index.ts";
import type { EntityWrites, ListLink } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetData, RulesetView, ViewEntities } from "@/engine/core/view/index.ts";
import type { Property } from "@/shared/relations.ts";

/**
 * A ruleset's entity kind (its table, `type`), as its rules answer the server of it in a ruleset's view. Every kind
 * takes the same steps, and adds its rules to the ones they name:
 * - an entity found by its id (`find`) and described (`describe`): its row as the view resolves it, with the fields its
 *   properties hold (`fields`);
 * - a page of its rows (`openList`): what the server reads it with (`filters`), and its rows described alike;
 * - what its form writes (`planCreate`, `planEdit`): the fields the form gives, read by its codec (`fieldsSchema`),
 *   the form checked (`checkForm`), its row's columns (`columnsOf`), the lists it's linked to (`linksOf`), what it
 *   writes beside them (`writesOf`: its fields, the feats it makes), and the fields it keeps once written (`fields`,
 *   which a create or an edit answers with its row);
 * - what deleting one writes (`planDelete`): checked (`checkDelete`), and what it writes with it (`deleteWritesOf`).
 */
export default abstract class RulesetEntity<
  K extends keyof ViewEntities,
  Body extends object,
  Columns extends object = Body,
  S extends Fields = NoFields,
> {
  constructor(protected readonly view: RulesetView) {}

  /** The fields its properties hold: `FieldCodec.NONE`, none of its own. */
  protected abstract readonly fields: FieldCodec<S>;

  /** What a refusal calls one: "Save" in "Save not found in this ruleset". */
  protected abstract readonly label: string;

  /** The kind's table. */
  abstract readonly type: K;

  /** A form's columns: the ones the kind's row takes (`entity`: the one edited, none for a new one). */
  protected abstract columnsOf(body: Body, entity?: ViewEntities[K]): Columns;

  /** What a form writes, and the fields the entity keeps (`fields`, which a create or an edit answers with its row). */
  private planWrite(body: Body, given: Partial<FieldValues<S>>, entity?: ViewEntities[K]) {
    const columns = this.columnsOf(body, entity);
    const writes = this.writesOf(body, given, entity);
    const fields = this.fields.read(writes?.properties?.values ?? this.keptProperties(columns, entity));
    return { columns, fields, links: this.linksOf(body), writes };
  }

  /**
   * The fields a form gives (its `fields`, which the route carries as it is), read by the kind's codec: none when it
   * gives none (a kind whose page edits its properties), and refused as invalid, as a route's validation refuses a body,
   * when one isn't the field's type or in its bounds.
   */
  private readFields(body: Body, entity?: ViewEntities[K]): Partial<FieldValues<S>> {
    const given = "fields" in body ? body.fields : undefined;
    return given === undefined ? {} : RulesError.parse(this.fieldsSchema(entity), given, ["fields"]);
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
    return this.rulesetData.cow
      .resolveRows(rows)
      .map((row) => ({ ...row, ...this.fields.read(this.propertiesOf(row)) }));
  }

  /**
   * What a form's fields are read by: every field for a new entity, those it changes for an edit (`entity`), which the
   * engine merges over those the entity keeps.
   */
  protected fieldsSchema(entity?: ViewEntities[K]): z.ZodType<Partial<FieldValues<S>>> {
    return this.fields.schema({ optional: !!entity });
  }

  /**
   * The fields a form writes: the ones it gives over the edited entity's (a new one's defaults). None when
   * the form gives none: an edit keeps those it has, and a new entity keeps none.
   */
  protected formFields(given: Partial<FieldValues<S>>, entity?: ViewEntities[K]) {
    if (this.fields.keys.every((key) => given[key] === undefined)) return undefined;
    return this.fields.merge(entity ? this.fields.read(this.propertiesOf(entity)) : this.fields.defaults, given);
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

  /** The properties an entity's fields are read off: its own (an item's, merged with its template's). */
  protected propertiesOf(entity: { id: string }): Property[] {
    return this.rulesetData.propertiesByEntity.get(entity.id) ?? [];
  }

  /** The ruleset's view, as its rules read it. */
  protected get rulesetData(): RulesetData {
    return this.view.rulesetData;
  }

  /**
   * What a form writes beside the row (`given`: the fields it gives, read; `entity`: the one edited): nothing,
   * unless its kind's rules say.
   */
  protected writesOf(
    _body: Body,
    _given: Partial<FieldValues<S>>,
    _entity?: ViewEntities[K],
  ): EntityWrites | undefined {
    return undefined;
  }

  /** An entity as its page shows it: its row as the view resolves it, with the fields its properties hold. */
  describe(id: string) {
    return this.describeRows([this.find(id)])[0];
  }

  /** The entity the view shows for an id: refused when it shows none. */
  find(id: string): ViewEntities[K] {
    const entity = this.rulesetData.find(this.type, id);
    if (!entity) throw new RulesError("not-found", `${this.label} not found in this ruleset`);
    return entity;
  }

  /**
   * A page of the kind's rows, as its list asks for it: what the server reads it with (`filters`: the ruleset's rows,
   * unless its kind's list narrows them), and its rows described.
   */
  openList(_where: { childOnly?: boolean }) {
    return {
      describe: <T extends Record<string, unknown> & { id: string }>(rows: T[]) => this.describeRows(rows),
      filters: {},
    };
  }

  /** A new entity's row off its form, what it writes beside it, and the fields it keeps once written. */
  planCreate(body: Body) {
    const given = this.readFields(body);
    this.checkForm(body);
    return this.planWrite(body, given);
  }

  /** Deleting an entity (`id`): the entity as the view has it, and what its delete writes with it. */
  planDelete(id: string) {
    const entity = this.find(id);
    this.checkDelete(entity);
    return { entity, writes: this.deleteWritesOf(entity) };
  }

  /**
   * An entity's edit (`id`): the entity as the view has it, its new row off its form (an edit leaves the columns it
   * doesn't give as they are), what it writes beside it, and the fields it keeps once written.
   */
  planEdit(id: string, body: Body) {
    const entity = this.find(id);
    const given = this.readFields(body, entity);
    this.checkForm(body, entity);
    return { ...this.planWrite(body, given, entity), entity };
  }
}
