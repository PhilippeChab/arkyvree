import { baseRules } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

import { createRulesetModule as createDnd35Module } from "./dnd3.5/index.ts";
import type { RulesetModule } from "./types.ts";

/** Each base rules' module: one the database's enum gains has to be written here, or the server doesn't compile. */
const MODULES: Record<BaseRules, () => RulesetModule> = {
  "Dungeons & Dragons: 3.5": createDnd35Module,
};

export class RulesetFactory {
  static fromBaseRules(baseRules: BaseRules): RulesetModule {
    return MODULES[baseRules]();
  }

  static async fromRulesetId(rulesetId: string): Promise<RulesetModule> {
    const ruleset = await Rulesets.findOne(db, { id: rulesetId });

    if (!ruleset) {
      throw new NotFoundError("Ruleset not found");
    }

    return this.fromBaseRules(ruleset.baseRules);
  }

  static getSupportedRulesets(): string[] {
    return baseRules.enumValues;
  }
}
