import { AbilitiesMethods } from "@/server/services/rulesets/AbilitiesService.ts";
import { db } from "@/server/database/index.ts";
import { Abilities, Rulesets, Users } from "@/server/repositories/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { describe, expect, test } from "bun:test";

describe("AbilitiesService", () => {
  async function createTestSetup() {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const users = await Users.create(db, {
      username: `testuser-${uniqueId}`,
      emailAddress: `test-${uniqueId}@example.com`,
      password: "password1234",
    });
    const user = users[0];

    const rulesets = await Rulesets.create(db, {
      name: `Test Ruleset ${uniqueId}`,
      description: "Test ruleset for abilities testing",
      private: true,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
    });
    const ruleset = rulesets[0];

    return { user, ruleset };
  }

  describe("getRulesetAbilities", () => {
    test("should return empty paginated result when no abilities exist", async () => {
      const { ruleset } = await createTestSetup();

      const result = await AbilitiesMethods.getRulesetAbilities(
        ruleset.id,
        {},
        { limit: 10, page: 1 },
      );

      expect(result.items).toEqual([]);
    });

    test("should return abilities for a ruleset", async () => {
      const { ruleset } = await createTestSetup();

      await Abilities.createMany(db, [
        { name: "Strength", description: "Physical power", rulesetId: ruleset.id },
        { name: "Dexterity", description: "Agility", rulesetId: ruleset.id },
        { name: "Constitution", description: "Endurance", rulesetId: ruleset.id },
      ]);

      const result = await AbilitiesMethods.getRulesetAbilities(
        ruleset.id,
        {},
        { limit: 10, page: 1 },
      );

      expect(result.items.length).toBe(3);
    });

    test("should support search filtering", async () => {
      const { ruleset } = await createTestSetup();

      await Abilities.createMany(db, [
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
      const { ruleset } = await createTestSetup();

      await Abilities.createMany(db, [
        { name: "Strength", description: "Physical power", rulesetId: ruleset.id },
        { name: "Dexterity", description: "Agility", rulesetId: ruleset.id },
        { name: "Constitution", description: "Endurance", rulesetId: ruleset.id },
      ]);

      const result = await AbilitiesMethods.getRulesetAbilities(
        ruleset.id,
        {},
        { limit: 2, page: 1 },
      );

      expect(result.items.length).toBe(2);
      expect(result.nextPage).toBe(2);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      await expect(
        AbilitiesMethods.getRulesetAbilities(
          "00000000-0000-0000-0000-000000000000",
          {},
          { limit: 10, page: 1 },
        ),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
