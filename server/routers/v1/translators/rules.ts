/** What a ruleset's base rules are, as v1 answers them: their kinds, fields, tiers and progression's names. */

import type { z } from "zod";

import type { v1Rules } from "@/server/routers/v1/schemas/rules.ts";
import type { RulesService } from "@/server/services/rules/index.ts";

/** What one base rules' rulesets are made of, as the engine describes it. */
type RulesDescription = ReturnType<typeof RulesService.getRules>[keyof ReturnType<typeof RulesService.getRules>];

/** One base rules' description: what v1 names of it. */
function toV1RulesDescription(rules: RulesDescription): z.infer<typeof v1Rules>[string] {
  const { counts, grants } = rules.progression;
  return {
    characterKinds: rules.entityKinds.map(({ label, value }) => ({ label, value })),
    fields: Object.fromEntries(
      Object.entries(rules.fields).map(([kind, fields]) => [kind, (fields ?? []).map((field) => ({ ...field }))]),
    ),
    kinds: rules.kinds.map((kind) => ({
      families: kind.families ?? false,
      links: kind.links ? { role: kind.links.role, type: kind.links.type } : null,
      partitioned: kind.partitioned ?? false,
      pools: kind.pools ? { role: kind.pools.role, scope: kind.pools.scope, type: kind.pools.type } : null,
      readOnly: kind.readOnly ?? false,
      tiered: kind.levels ?? false,
      type: kind.type,
    })),
    progression: { list: counts?.list ?? null, picks: grants?.picks ?? null, several: counts?.several ?? null },
    tiers: rules.tiers.map(({ label, level }) => ({ label, level })),
  };
}

/** Each base rules' description, by its name. */
export function toV1Rules(rules: ReturnType<typeof RulesService.getRules>): z.infer<typeof v1Rules> {
  return Object.fromEntries(Object.entries(rules).map(([baseRules, rule]) => [baseRules, toV1RulesDescription(rule)]));
}
