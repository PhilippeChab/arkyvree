import type { RulesetView } from "@/engine/core/view/index.ts";

import type { Module, Rest } from "./Modules.ts";

/** What its module answers of the ruleset's entities, past the view the handle binds. */
type Args<K extends keyof Module["entities"]> = Rest<Module["entities"][K], [RulesetView]>;

/** The engine bound to the ruleset's classes: a new one, and a level found by its id alone. */
export default class ClassesEngine {
  constructor(
    private readonly view: RulesetView,
    private readonly module: Module,
  ) {}

  /** A class level by its id alone, with its details, its class's name and the ruleset that holds its class. */
  describeLevel(...args: Args<"describeClassLevelWithClass">) {
    return this.module.entities.describeClassLevelWithClass(this.view, ...args);
  }

  /** A new class's row: its hit die 8 when the form gives none. */
  planCreate(...args: Args<"planClassCreate">) {
    return this.module.entities.planClassCreate(this.view, ...args);
  }
}
