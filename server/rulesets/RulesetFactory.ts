import { baseRules } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import type { RulesetModule } from "./types.ts";

import { createRulesetModule as createDnd35Module } from "./dnd3.5/index.ts";

type BaseRules = (typeof baseRules.enumValues)[number];

export class RulesetFactory {
  static fromBaseRules(baseRules: BaseRules): RulesetModule {
    switch (baseRules) {
      case "Dungeons & Dragons: 3.5":
        return createDnd35Module();
      default:
        throw new Error(
          `Unsupported ruleset: ${baseRules}. Supported rulesets: ${
            this.getSupportedRulesets().join(", ")
          }`,
        );
    }
  }

  static async fromRulesetId(rulesetId: string): Promise<RulesetModule> {
    const ruleset = await Rulesets.findOne(db, { id: rulesetId });

    if (!ruleset) {
      throw new Error(`Ruleset not found: ${rulesetId}`);
    }

    return this.fromBaseRules(ruleset.baseRules);
  }

  static getSupportedRulesets(): string[] {
    return baseRules.enumValues;
  }
}
