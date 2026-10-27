import { describe, expect, test } from "bun:test";

import type { RulesetAbility } from "@/engine/rulesets/dnd3.5/index.ts";
import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Entities } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";
import { ownerSessionOf } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

describe("EntitiesService: abilities", () => {
  describe("getAbilities", () => {
    test("should return empty paginated result when no abilities exist", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      const result = await EntitiesService.getEntities(
        await ownerSessionOf(ruleset.id),
        ruleset.id,
        "abilities",
        {},
        { limit: 10, page: 1 },
      );

      expect(result.items).toEqual([]);
    });

    test("should return abilities for a ruleset", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      await Entities.createMany<RulesetAbility>(db, "abilities", [
        { name: "Strength", description: "Physical power", rulesetId: ruleset.id },
        { name: "Dexterity", description: "Agility", rulesetId: ruleset.id },
        { name: "Constitution", description: "Endurance", rulesetId: ruleset.id },
      ]);

      const result = await EntitiesService.getEntities(
        await ownerSessionOf(ruleset.id),
        ruleset.id,
        "abilities",
        {},
        { limit: 10, page: 1 },
      );

      expect(result.items.length).toBe(3);
    });

    test("should support search filtering", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      await Entities.createMany<RulesetAbility>(db, "abilities", [
        { name: "Strength", description: "Physical power", rulesetId: ruleset.id },
        { name: "Dexterity", description: "Agility", rulesetId: ruleset.id },
      ]);

      const result = await EntitiesService.getEntities(
        await ownerSessionOf(ruleset.id),
        ruleset.id,
        "abilities",
        { search: "Strength" },
        { limit: 10, page: 1 },
      );

      expect(result.items.length).toBe(1);
      expect(result.items[0].name).toBe("Strength");
    });

    test("should support pagination", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      await Entities.createMany<RulesetAbility>(db, "abilities", [
        { name: "Strength", description: "Physical power", rulesetId: ruleset.id },
        { name: "Dexterity", description: "Agility", rulesetId: ruleset.id },
        { name: "Constitution", description: "Endurance", rulesetId: ruleset.id },
      ]);

      const result = await EntitiesService.getEntities(
        await ownerSessionOf(ruleset.id),
        ruleset.id,
        "abilities",
        {},
        { limit: 2, page: 1 },
      );

      expect(result.items.length).toBe(2);
      expect(result.nextPage).toBe(2);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      expect(
        EntitiesService.getEntities(await ownerSessionOf(NIL_UUID), NIL_UUID, "abilities", {}, { limit: 10, page: 1 }),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
