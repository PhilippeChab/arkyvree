import { describe, expect, test } from "bun:test";

import type { RulesetAbility } from "@/engine/rulesets/dnd3.5/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";
import { ownerSessionOf } from "@/tests/support/rulesets.ts";
import { DND35_BASE_RULES } from "@/vocabulary/dnd3.5/baseRules.ts";

describe("EntitiesService: abilities", () => {
  describe("getAbilities", () => {
    test("should support pagination", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      await Entities.createMany<RulesetAbility>(db, DND35_BASE_RULES, "abilities", [
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
  });
});
