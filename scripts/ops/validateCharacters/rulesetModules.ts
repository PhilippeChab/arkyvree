import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";

/** Each ruleset's module, built once. */
const modules = new Map<string, ReturnType<typeof RulesetFactory.fromRulesetId>>();

export function moduleOf(rulesetId: string) {
  let module = modules.get(rulesetId);
  if (!module) {
    module = RulesetFactory.fromRulesetId(rulesetId);
    modules.set(rulesetId, module);
  }
  return module;
}
