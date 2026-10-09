import type { RulesetView } from "@/engine/core/view/index.ts";

import type { Module, Rest } from "./Modules.ts";

/** What its module answers of the ruleset's entities, past the view the handle binds. */
type Args<K extends keyof Module["entities"]> = Rest<Module["entities"][K], [RulesetView]>;

/** The engine bound to the ruleset's feats: a page of them, and what saving one writes. */
export default class FeatsEngine {
  constructor(
    private readonly view: RulesetView,
    private readonly module: Module,
  ) {}

  /** A page of feats: the filters a page reads them by, and what describes the rows it read. */
  openList(...args: Args<"openFeatList">) {
    return this.module.entities.openFeatList(this.view, ...args);
  }

  /** A new feat's row and pools: refused without a pool, or with a pool a spell uses. */
  planCreate(...args: Args<"planFeatCreate">) {
    return this.module.entities.planFeatCreate(this.view, ...args);
  }

  /** A feat's edit: the feat, its new row and pools; refused when a generated feat is renamed, or a spell's pool linked. */
  planEdit(...args: Args<"planFeatEdit">) {
    return this.module.entities.planFeatEdit(this.view, ...args);
  }
}
