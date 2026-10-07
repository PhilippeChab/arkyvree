import type { RulesetModule } from "@/engine/core/module/index.ts";
import { createRulesetModule as createDnd35Module } from "@/engine/rulesets/dnd3.5/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

/**
 * Each base rules' module, built once: a module keeps no state (its rules and effects are fieldless, its factories make
 * a new character or path set on each call). One the database's enum gains has to be written here, or the engine
 * doesn't compile. Each keeps the type its factory gives it, a `RulesetModule` of its own character, projector, kinds,
 * level-up and bonded creatures (`Dnd35RulesetModule`), so the code that reads its parts needs no cast. The table checks
 * every member of the contract but the character's factory, which its factory's return type checks: a module makes its
 * own character, so it can't widen to a `RulesetModule` of any character.
 */
const MODULES = {
  "Dungeons & Dragons: 3.5": createDnd35Module(),
} satisfies Record<BaseRules, Omit<RulesetModule, "createDetailedCharacter">>;

/** A base rules' module: what the server asks of a ruleset's characters and level-ups. */
export function getRulesetModule(baseRules: BaseRules) {
  return MODULES[baseRules];
}
