import type { RulesDescription, RulesetModule } from "@/engine/core/module/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

/** The engine asked of what every base rules' rulesets share, before any ruleset: their words, kinds and license. */
export default class RulesEngine {
  constructor(private readonly modules: [BaseRules, RulesetModule][]) {}

  /** What each base rules' rulesets share, by base rules: what the client reads once, for every ruleset it shows. */
  describeAll(): Record<BaseRules, RulesDescription> {
    return Object.fromEntries(
      this.modules.map(([baseRules, module]) => [baseRules, module.ruleset.describeRules()]),
    ) as Record<BaseRules, RulesDescription>;
  }
}
