import type { RulesetModule } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/types.ts";
import { createRulesetModule as createDnd35Module } from "@/engine/rulesets/dnd3.5/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

/** An operation's arguments after the view, which picks the ruleset. */
export type After<F> = F extends (view: RulesetView, ...rest: infer R) => unknown ? R : never;

/**
 * Each base rules' module, built once: a module keeps no state (its parts are fieldless, its factories make new paths
 * on each call). One the database's enum gains has to be written here, or the engine doesn't compile. Each keeps the
 * type its factory gives it (`Dnd35RulesetModule`), so the operations that read its parts need no cast, and the table
 * checks it against the contract.
 */
const MODULES = {
  "Dungeons & Dragons: 3.5": createDnd35Module(),
} satisfies Record<BaseRules, RulesetModule>;

/** A base rules' module: what the entry's operations ask of the ruleset they're handed. */
export function getRulesetModule(baseRules: BaseRules) {
  return MODULES[baseRules];
}
