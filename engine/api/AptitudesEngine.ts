import type { RulesetView } from "@/engine/core/view/index.ts";

import type { Module, Rest } from "./Modules.ts";

/** What its module answers of the ruleset's entities, past the view the handle binds. */
type Args<K extends keyof Module["entities"]> = Rest<Module["entities"][K], [RulesetView]>;

/** The engine bound to the ruleset's aptitudes: what an edit or a delete of one is refused. */
export default class AptitudesEngine {
  constructor(
    private readonly view: RulesetView,
    private readonly module: Module,
  ) {}

  /** Deleting an aptitude: the aptitude, refused when the ruleset's characters count on it by name. */
  planDelete(...args: Args<"planAptitudeDelete">) {
    return this.module.entities.planAptitudeDelete(this.view, ...args);
  }

  /** An aptitude's edit: the aptitude, refused when the ruleset's characters count on its name. */
  planEdit(...args: Args<"planAptitudeEdit">) {
    return this.module.entities.planAptitudeEdit(this.view, ...args);
  }
}
