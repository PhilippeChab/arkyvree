import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { expect, describe, test } from "bun:test";

describe("RulesetFactory", () => {
  test("getSupportedRulesets returns correct rulesets", () => {
    const rulesets = RulesetFactory.getSupportedRulesets();
    expect(rulesets).toEqual([
      "Dungeons & Dragons: 3.5",
    ]);
  });

  test("fromRulesetId throws error for non-existent ruleset", async () => {
    try {
      await RulesetFactory.fromRulesetId("00000000-0000-0000-0000-000000000000");
      throw new Error("Should have thrown an error");
    } catch (error) {
      expect(error).toBeDefined();
      if (error instanceof Error) {
        expect(error.message).toBe("Ruleset not found: 00000000-0000-0000-0000-000000000000");
      }
    }
  });

  test("fromBaseRules throws error for unsupported ruleset", () => {
    try {
      // @ts-expect-error testing unsupported ruleset
      RulesetFactory.fromBaseRules("Unsupported Ruleset");
      throw new Error("Should have thrown an error");
    } catch (error) {
      expect(error).toBeDefined();
      if (error instanceof Error) {
        expect(error.message).toContain("Unsupported ruleset");
      }
    }
  });

  test("fromBaseRules returns a valid module for D&D 3.5", () => {
    const module = RulesetFactory.fromBaseRules("Dungeons & Dragons: 3.5");
    expect(module).toBeDefined();
    expect(module.hooks).toBeDefined();
    expect(module.createDetailedCharacter).toBeFunction();
    expect(module.createDetailedCharacterWithSheet).toBeFunction();
    expect(module.createTargetPaths).toBeFunction();
    expect(module.createPropertyTypes).toBeFunction();
  });
});
