import type { RulesetModule } from "@/server/rulesets/engine/types.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";

/** Each ruleset's module, built once. */
const modules = new Map<string, Promise<RulesetModule>>();

export function moduleOf(rulesetId: string): Promise<RulesetModule> {
  let module = modules.get(rulesetId);
  if (!module) {
    module = RulesetFactory.fromRulesetId(rulesetId);
    modules.set(rulesetId, module);
  }
  return module;
}
