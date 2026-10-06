import { describe, expect, test } from "bun:test";

import { NotFoundError } from "@/server/errors/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

describe("RulesetFactory", () => {
  test("supports D&D 3.5 only", () => {
    expect(RulesetFactory.getSupportedRulesets()).toEqual(["Dungeons & Dragons: 3.5"]);
  });

  test("throws NotFoundError for a ruleset that doesn't exist", async () => {
    await expect(RulesetFactory.fromRulesetId(NIL_UUID)).rejects.toThrow(NotFoundError);
  });

  test("builds the D&D 3.5 module", () => {
    const module = RulesetFactory.fromBaseRules("Dungeons & Dragons: 3.5");
    expect(module.hooks).toBeDefined();
    expect(module.createDetailedCharacter).toBeFunction();
    expect(module.createDetailedCharacterWithSheet).toBeFunction();
    expect(module.createTargetPaths).toBeFunction();
    expect(module.createPropertyTypes).toBeFunction();
  });
});
