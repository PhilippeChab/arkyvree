import type { RulesetView } from "@/engine/core/view/index.ts";

import type { Module, Rest } from "./Modules.ts";

/** What its module answers of the ruleset's entities, past the view the handle binds. */
type Args<K extends keyof Module["entities"]> = Rest<Module["entities"][K], [RulesetView]>;

/** The engine bound to the ruleset's items: an item described, and what saving, duplicating or deleting one writes. */
export default class ItemsEngine {
  constructor(
    private readonly view: RulesetView,
    private readonly module: Module,
  ) {}

  /** An item with its modifiers, its template's properties under its own, and both's requirements. */
  describe(...args: Args<"describeItem">) {
    return this.module.entities.describeItem(this.view, ...args);
  }

  /** A page of items (rows as stored), each with its template's name. */
  describeAll<T extends { sourceItemId: string | null }>(rows: T[]) {
    return this.module.entities.describeItems(this.view, this.view.rulesetData.cow.resolveRows(rows));
  }

  /** A new item's row, or a duplicate's, and whose customizations it copies: refused when a template has a source. */
  planCreate(...args: Args<"planItemCreate">) {
    return this.module.entities.planItemCreate(this.view, ...args);
  }

  /** Deleting an item: the item, and, a template, the item whose copies refuse its delete. */
  planDelete(...args: Args<"planItemDelete">) {
    return this.module.entities.planItemDelete(this.view, ...args);
  }

  /** An item's edit: the item and its new row; refused when a template is given a source. */
  planEdit(...args: Args<"planItemEdit">) {
    return this.module.entities.planItemEdit(this.view, ...args);
  }

  /** An item's variants: each one's row, copied from its source; refused with two of a name. */
  planVariants(...args: Args<"planItemVariants">) {
    return this.module.entities.planItemVariants(this.view, ...args);
  }
}
