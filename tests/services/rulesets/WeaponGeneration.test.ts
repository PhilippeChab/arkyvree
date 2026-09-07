import { ItemsMethods } from "@/server/services/rulesets/ItemsService.ts";
import { db } from "@/server/database/index.ts";
import {
  Items,
  Properties,
  Rulesets,
  Users,
} from "@/server/repositories/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, test, expect } from "bun:test";

function createTestSession(userId: string): Session {
  return {
    id: `session-${Math.random().toString(36).substr(2, 9)}`,
    userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

async function createTestUserAndRuleset() {
  const uniqueId = Math.random().toString(36).substr(2, 9);

  const users = await Users.create(db, {
    username: `testuser-${uniqueId}`,
    emailAddress: `test-${uniqueId}@example.com`,
    password: "password1234",
  });
  const user = users[0];
  const session = createTestSession(user.id);

  const rulesets = await Rulesets.create(db, {
    name: `Test Ruleset ${uniqueId}`,
    description: "Test ruleset for template item testing",
    private: true,
    baseRules: "Dungeons & Dragons: 3.5",
    userId: user.id,
    status: "Draft",
  });
  const ruleset = rulesets[0];
  const rulesetModule = RulesetFactory.fromBaseRules("Dungeons & Dragons: 3.5");
  await rulesetModule.seedRuleset(db, ruleset.id);

  return {
    user,
    ruleset,
    session,
  };
}

describe("Template Item Property Inheritance (Weapons)", () => {
  describe("getRulesetItem with sourceItemId", () => {
    test("should merge template properties into copy item", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Find the Longsword template
      const templates = await Items.findTemplates(db, { rulesetId: ruleset.id, type: "Weapon" });
      const longswordTemplate = templates.find((t) => t.name === "Longsword");
      expect(longswordTemplate).toBeDefined();

      // Create a copy item referencing the template
      const copy = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "My Longsword",
        description: "A custom longsword",
        type: "Weapon",
        sourceItemId: longswordTemplate!.id,
      });

      // Fetch the copy via getRulesetItem — should include merged template properties
      const result = await ItemsMethods.getRulesetItem(ruleset.id, copy.id);

      const propMap = new Map(result.properties.map((p) => [p.type, p.value]));
      expect(propMap.get("WEAPON_PROFICIENCY")).toBe("Martial");
      expect(propMap.get("WEAPON_FAMILY")).toBe("Sword");
      expect(propMap.get("WEAPON_BASE_DAMAGE")).toBe("1d8");
      expect(propMap.get("WEAPON_SIZE")).toBe("Medium");
      expect(propMap.get("WEAPON_TYPE")).toBe("Longsword");
    });

    test("should include copy's own properties alongside template properties", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const templates = await Items.findTemplates(db, { rulesetId: ruleset.id, type: "Weapon" });
      const longswordTemplate = templates.find((t) => t.name === "Longsword");

      const copy = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Flaming Longsword +1",
        description: "An enhanced longsword",
        type: "Weapon",
        sourceItemId: longswordTemplate!.id,
      });

      // Add own property to the copy
      await Properties.createMany(db, [{
        entityId: copy.id,
        entityType: "items",
        type: "ITEM_MADE_OF",
        value: "Adamantine",
      }]);

      const result = await ItemsMethods.getRulesetItem(ruleset.id, copy.id);

      const propMap = new Map(result.properties.map((p) => [p.type, p.value]));
      // Template properties
      expect(propMap.get("WEAPON_BASE_DAMAGE")).toBe("1d8");
      // Own properties
      expect(propMap.get("ITEM_MADE_OF")).toBe("Adamantine");
    });

    test("should include template requirements in copy", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const templates = await Items.findTemplates(db, { rulesetId: ruleset.id, type: "Weapon" });
      const longswordTemplate = templates.find((t) => t.name === "Longsword");

      const copy = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "My Longsword",
        description: "A custom longsword",
        type: "Weapon",
        sourceItemId: longswordTemplate!.id,
      });

      const result = await ItemsMethods.getRulesetItem(ruleset.id, copy.id);

      // Martial weapon: OR chain with 3 requirement rows
      expect(result.requirements.length).toBe(3);
      expect(result.requirements.some((r) => r.chainingOperator === "or")).toBe(true);
    });

    test("should return no template properties for items without sourceItemId", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const item = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Custom Item",
        description: "A standalone item",
        type: "Weapon",
      });

      const result = await ItemsMethods.getRulesetItem(ruleset.id, item.id);
      expect(result.properties.length).toBe(0);
      expect(result.requirements.length).toBe(0);
    });
  });

  describe("template editing reflects in copies", () => {
    test("should reflect template property changes when reading copy", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const templates = await Items.findTemplates(db, { rulesetId: ruleset.id, type: "Weapon" });
      const longswordTemplate = templates.find((t) => t.name === "Longsword");

      const copy = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "My Longsword",
        description: "A custom longsword",
        type: "Weapon",
        sourceItemId: longswordTemplate!.id,
      });

      // Modify template property
      const templateProps = await Properties.findManyByEntity(db, {
        entityIds: [longswordTemplate!.id],
        entityType: "items",
      });
      const baseDamageProp = templateProps.find((p) => p.type === "WEAPON_BASE_DAMAGE");
      expect(baseDamageProp).toBeDefined();

      await Properties.update(db, { value: "2d6" }, { id: baseDamageProp!.id });

      // Reading the copy should reflect the updated template property
      const result = await ItemsMethods.getRulesetItem(ruleset.id, copy.id);
      const propMap = new Map(result.properties.map((p) => [p.type, p.value]));
      expect(propMap.get("WEAPON_BASE_DAMAGE")).toBe("2d6");
    });
  });
});
