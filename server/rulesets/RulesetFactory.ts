import { baseRules } from "@/drizzle/schema.ts";
import { getRulesetModule } from "@/engine/api/modules.ts";
import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

/** A ruleset's module, as the factory hands it out. */
export type RulesetModuleOf = ReturnType<typeof RulesetFactory.fromBaseRules>;

export class RulesetFactory {
  static fromBaseRules(baseRules: BaseRules) {
    return getRulesetModule(baseRules);
  }

  static getSupportedRulesets(): string[] {
    return baseRules.enumValues;
  }

  /** A ruleset's base rules, which its module and its sheet are kept by. */
  static async findBaseRules(rulesetId: string) {
    const ruleset = await Rulesets.findOne(db, { id: rulesetId });

    if (!ruleset) throw new NotFoundError("Ruleset not found");

    return ruleset.baseRules;
  }

  static async fromRulesetId(rulesetId: string) {
    return this.fromBaseRules(await this.findBaseRules(rulesetId));
  }
}
