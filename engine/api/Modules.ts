import type { RulesetModule } from "@/engine/core/module/index.ts";
import { Dnd35Module } from "@/engine/rulesets/dnd3.5/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

/** A base rules' module: the parts the engine's handles ask what its rules answer. */
export type Module = ReturnType<typeof Modules.of>;

/** A module's method's arguments after those a handle binds (`Lead`: the view, and the character or class it's for). */
export type Rest<F, Lead extends unknown[]> = F extends (...args: [...Lead, ...infer R]) => unknown ? R : never;

/**
 * Each base rules' module, built once: a module keeps no state (its parts are fieldless, its factories make new paths
 * on each call). One the database's enum gains has to be written here, or the engine doesn't compile. Each keeps the
 * type its factory gives it (`Dnd35RulesetModule`), so the handles that read its parts need no cast, and the table
 * checks it against the contract.
 */
const MODULES = {
  "Dungeons & Dragons: 3.5": Dnd35Module.create(),
} satisfies Record<BaseRules, RulesetModule>;

/** The base rules' modules, which the engine's handles ask what their rules answer. */
export default class Modules {
  /** A base rules' module. */
  static of(baseRules: BaseRules) {
    return MODULES[baseRules];
  }
}
