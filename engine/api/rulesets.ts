import { type CowData, CowDataBuilder, type CowRows, type RulesetSources } from "@/engine/core/cow/index.ts";
import { RulesetComposition, type RulesetData, type RulesetRawData } from "@/engine/core/view/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

import { getRulesetModule } from "./modules.ts";

/** A ruleset's copy-on-write data, from the rows read for it (`getCowReads`, `getPairedKlassIds`). */
export function buildCowData(ruleset: RulesetSources, rows: CowRows): CowData {
  return CowDataBuilder.build(ruleset, rows);
}

/**
 * A ruleset's view: its own rows and its source chain's (`chain`, its own first, then its chain's in order), composed
 * by its copy-on-write data (`cow`), each entity's properties in its rules' order.
 */
export function buildRulesetView(
  ruleset: { baseRules: BaseRules },
  chain: RulesetRawData[],
  cow: CowData,
): RulesetData {
  const { orderProperties } = getRulesetModule(ruleset.baseRules);
  return new RulesetComposition(chain, cow, orderProperties).build();
}
