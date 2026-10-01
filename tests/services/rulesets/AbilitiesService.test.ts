import { describe, expect, test } from "bun:test";

import { abilitiesInRules } from "@/drizzle/schema.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { AbilitiesMethods } from "@/server/services/rulesets/AbilitiesService.ts";
import { createTestUserAndRuleset, insertRows, NIL_UUID } from "@/tests/helpers.ts";

describe("AbilitiesService", () => {
  describe("getRulesetAbilities", () => {
    test("should return empty paginated result when no abilities exist", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      const result = await AbilitiesMethods.getRulesetAbilities(ruleset.id, {}, { limit: 10, page: 1 });

      expect(result.items).toEqual([]);
    });

    test("should return abilities for a ruleset", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      await insertRows(abilitiesInRules, [
        { name: "Strength", description: "Physical power", rulesetId: ruleset.id },
        { name: "Dexterity", description: "Agility", rulesetId: ruleset.id },
        { name: "Constitution", description: "Endurance", rulesetId: ruleset.id },
      ]);

      const result = await AbilitiesMethods.getRulesetAbilities(ruleset.id, {}, { limit: 10, page: 1 });

      expect(result.items.length).toBe(3);
    });

    test("should support search filtering", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      await insertRows(abilitiesInRules, [
        { name: "Strength", description: "Physical power", rulesetId: ruleset.id },
        { name: "Dexterity", description: "Agility", rulesetId: ruleset.id },
      ]);

      const result = await AbilitiesMethods.getRulesetAbilities(
        ruleset.id,
        { search: "Strength" },
        { limit: 10, page: 1 },
      );

      expect(result.items.length).toBe(1);
      expect(result.items[0].name).toBe("Strength");
    });

    test("should support pagination", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      await insertRows(abilitiesInRules, [
        { name: "Strength", description: "Physical power", rulesetId: ruleset.id },
        { name: "Dexterity", description: "Agility", rulesetId: ruleset.id },
        { name: "Constitution", description: "Endurance", rulesetId: ruleset.id },
      ]);

      const result = await AbilitiesMethods.getRulesetAbilities(ruleset.id, {}, { limit: 2, page: 1 });

      expect(result.items.length).toBe(2);
      expect(result.nextPage).toBe(2);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      await expect(AbilitiesMethods.getRulesetAbilities(NIL_UUID, {}, { limit: 10, page: 1 })).rejects.toThrow(
        NotFoundError,
      );
    });
  });
});
