import { baseRules } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

import { createRulesetModule as createDnd35Module } from "./dnd3.5/index.ts";
import type { RulesetModule } from "./engine/types.ts";

/**
 * Each base rules' module, built once: a module keeps no state (its rules and effects are fieldless, its factories make
 * a new character, sheet or path set on each call). One the database's enum gains has to be written here, or the server
 * doesn't compile. Each keeps the type its factory gives it, a `RulesetModule` of its own character, projector and kinds
 * (`Dnd35RulesetModule`), so the code that reads its rules' parts needs no cast. The table checks every member of the
 * contract but the ones typed by the module's character, which its factory's return type checks: the sheet takes the
 * module's own character, so a module can't widen to a `RulesetModule` of any character.
 */
const MODULES = {
  "Dungeons & Dragons: 3.5": createDnd35Module(),
} satisfies Record<
  BaseRules,
  Omit<RulesetModule, "createDetailedCharacter" | "createDetailedCharacterWithSheet" | "createLevelUpProjector">
>;

export class RulesetFactory {
  static fromBaseRules(baseRules: BaseRules) {
    return MODULES[baseRules];
  }

  static async fromRulesetId(rulesetId: string) {
    const ruleset = await Rulesets.findOne(db, { id: rulesetId });

    if (!ruleset) throw new NotFoundError("Ruleset not found");

    return this.fromBaseRules(ruleset.baseRules);
  }

  static getSupportedRulesets(): string[] {
    return baseRules.enumValues;
  }
}
