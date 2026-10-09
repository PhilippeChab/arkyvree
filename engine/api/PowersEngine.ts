import type { RulesetView } from "@/engine/core/types.ts";

import type { Module, Rest } from "./Modules.ts";

/** What its module answers of the ruleset's entities, past the view the handle binds. */
type Args<K extends keyof Module["entities"]> = Rest<Module["entities"][K], [RulesetView]>;

/** The engine bound to the ruleset's powers: a page of them, and what saving one writes. */
export default class PowersEngine {
  constructor(
    private readonly view: RulesetView,
    private readonly module: Module,
  ) {}

  /** A page of powers: the filters a page reads them by, and what describes the rows it read. */
  openList(...args: Args<"openPowerList">) {
    return this.module.entities.openPowerList(this.view, ...args);
  }

  /** A new power's row, pool links and what its save writes beside them: refused without a pool, or a feat's pool. */
  planCreate(...args: Args<"planPowerCreate">) {
    return this.module.entities.planPowerCreate(this.view, ...args);
  }

  /** A power's edit: the power, its new row and pool links, and what its save writes; refused when a feat's pool is linked. */
  planEdit(...args: Args<"planPowerEdit">) {
    return this.module.entities.planPowerEdit(this.view, ...args);
  }
}
