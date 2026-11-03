import { Engine } from "@/engine/index.ts";

/** What every base rules' rulesets share, as their rules describe it: no ruleset's, so no access to check. */
class RulesService {
  /** Each base rules' words, the kinds a race or a class is for, a class's and a spell's levels, and their license. */
  getRules() {
    return Engine.rules().describeAll();
  }
}

export default new RulesService();
