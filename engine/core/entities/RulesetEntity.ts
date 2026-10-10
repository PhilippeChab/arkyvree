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
 * - what saving one writes (`planCreate`, `planEdit`): its form checked (`checkSave`), its row's columns (`columnsOf`),
 *   the lists it's linked to (`linksOf`), what it writes beside them (`writesOf`: its fields, the feats it makes), and
 *   the fields it keeps once saved (`fields`, which a save answers with its row);
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

  /** Refuses deleting an entity: nothing does, unless its kind's rules say. */
  protected checkDelete(_entity: ViewEntities[K]) {}

  /** Refuses saving a form (`entity`: the one edited, none for a new one): nothing does, unless its kind's rules say. */
  protected checkSave(_body: Body, _entity?: ViewEntities[K]) {}

  /** A form's columns: the ones the kind's row takes (`entity`: the one edited, none for a new one). */
  protected abstract columnsOf(body: Body, entity?: ViewEntities[K]): Columns;

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
   * The fields a save keeps from its form: the ones it gives over the edited entity's (a new one's defaults). None when
   * the form gives none: an edit keeps those it has, and a new entity keeps none.
   */
  protected formFields(given: Partial<FieldValues<S>>, entity?: ViewEntities[K]) {
    if (this.fields.keys.every((key) => given[key] === undefined)) return undefined;
    return this.fields.merge(entity ? this.fields.read(this.propertiesOf(entity)) : this.fields.defaults, given);
  }

  /**
   * The properties a saved entity's fields are read off when its save writes none: the edited one's, none for a new one
   * (an item's, its template's).
   */
  protected keptProperties(_columns: Columns, entity?: ViewEntities[K]): Property[] {
    return entity ? this.propertiesOf(entity) : [];
  }

  /** The lists a form links the entity to: none (`undefined`, an edit's kept), unless its kind is listed. */
  protected linksOf(_body: Body): ListLink[] | undefined {
    return undefined;
  }

  /** What saving a form writes, and the fields the saved entity keeps (`fields`, which a save answers with its row). */
  private planSave(body: Body, entity?: ViewEntities[K]) {
    const columns = this.columnsOf(body, entity);
    const writes = this.writesOf(body, entity);
    const fields = this.fields.read(writes?.properties?.values ?? this.keptProperties(columns, entity));
    return { columns, fields, links: this.linksOf(body), writes };
  }

  /** The properties an entity's fields are read off: its own (an item's, merged with its template's). */
  protected propertiesOf(entity: { id: string }): Property[] {
    return this.rulesetData.propertiesByEntity.get(entity.id) ?? [];
  }

  /** The ruleset's view, as its rules read it. */
  protected get rulesetData(): RulesetData {
    return this.view.rulesetData;
  }

  /** What saving a form writes beside the row (`entity`: the one edited): nothing, unless its kind's rules say. */
  protected writesOf(_body: Body, _entity?: ViewEntities[K]): EntityWrites | undefined {
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

  /** A new entity's row off its form, what it writes beside it, and the fields it keeps once saved. */
  planCreate(body: Body) {
    this.checkSave(body);
    return this.planSave(body);
  }

  /** Deleting an entity (`id`): the entity as the view has it, and what its delete writes with it. */
  planDelete(id: string) {
    const entity = this.find(id);
    this.checkDelete(entity);
    return { entity, writes: this.deleteWritesOf(entity) };
  }

  /**
   * An entity's edit (`id`): the entity as the view has it, its new row off its form (an edit leaves the columns it
   * doesn't give as they are), what it writes beside it, and the fields it keeps once saved.
   */
  planEdit(id: string, body: Body) {
    const entity = this.find(id);
    this.checkSave(body, entity);
    return { ...this.planSave(body, entity), entity };
  }
}
