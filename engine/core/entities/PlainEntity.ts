import type { ViewEntities } from "@/engine/core/view/index.ts";

import RulesetEntity from "./RulesetEntity.ts";

/** A plain kind's form: an entity's name, its description, and its kind's other columns. */
type PlainBody = { description?: string | null; name: string };

/**
 * A kind whose saves are its row's columns alone: an ability, a save, a language, a mechanic, a race, a class, an
 * aptitude. Its row takes the columns its kind names off a form (`columnsOf`), never more, those it gives (an edit
 * leaves the others as they are); a new one's name must be free in the ruleset's view.
 */
export default abstract class PlainEntity<
  K extends keyof ViewEntities,
  Body extends PlainBody,
> extends RulesetEntity<K> {
  /** A form's columns: the ones the kind's row takes. */
  protected abstract columnsOf(body: Body): Body;

  /** A page of the kind's rows, as stored, as the view reads them. */
  describePage<T extends Record<string, unknown>>(rows: T[]) {
    return this.view.rulesetData.cow.resolveRows(rows);
  }

  /** A new entity's row, from its form, and the name it must keep free. */
  planCreate(body: Body) {
    return { columns: this.columnsOf(body), name: body.name };
  }

  /** An entity's edit (`id`): the entity as the view has it, and its new row's columns. */
  planEdit(id: string, body: Body) {
    return { columns: this.columnsOf(body), entity: this.find(id) };
  }
}
