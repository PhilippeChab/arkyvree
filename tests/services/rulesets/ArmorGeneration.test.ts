import { ItemsMethods } from "@/server/services/rulesets/ItemsService.ts";
import { db } from "@/server/database/index.ts";
import {
  Items,
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

describe("Template Item Property Inheritance (Armor)", () => {
  describe("getRulesetItem with armor template", () => {
    test("should merge armor template properties into copy item", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const templates = await Items.findTemplates(db, { rulesetId: ruleset.id, type: "Armor" });
      const chainMailTemplate = templates.find((t) => t.name === "Chain Mail");
      expect(chainMailTemplate).toBeDefined();

      const copy = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "My Chain Mail",
        description: "A custom chain mail",
        type: "Armor",
        sourceItemId: chainMailTemplate!.id,
      });

      const result = await ItemsMethods.getRulesetItem(ruleset.id, copy.id);
      const propMap = new Map(result.properties.map((p) => [p.type, p.value]));

      expect(propMap.get("ARMOR_PROFICIENCY")).toBe("Medium");
      expect(propMap.get("ARMOR_TYPE")).toBe("Chain Mail");
      expect(propMap.get("ARMOR_AC_BONUS")).toBe("5");
      expect(propMap.get("ARMOR_MAX_DEX")).toBe("2");
      expect(propMap.get("ARMOR_CHECK_PENALTY")).toBe("-5");
      expect(propMap.get("ITEM_SPELL_FAILURE")).toBe("30");
    });

    test("should include armor template requirements", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const templates = await Items.findTemplates(db, { rulesetId: ruleset.id, type: "Armor" });
      const chainMailTemplate = templates.find((t) => t.name === "Chain Mail");

      const copy = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "My Chain Mail",
        description: "A custom chain mail",
        type: "Armor",
        sourceItemId: chainMailTemplate!.id,
      });

      const result = await ItemsMethods.getRulesetItem(ruleset.id, copy.id);
      expect(result.requirements.length).toBe(1);
      expect(result.requirements[0].target).toContain("armorproficiencymedium");
    });
  });

  describe("getRulesetItem with shield template", () => {
    test("should merge shield template properties into copy item", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const templates = await Items.findTemplates(db, { rulesetId: ruleset.id, type: "Shield" });
      const heavySteelTemplate = templates.find((t) => t.name === "Heavy Steel Shield");
      expect(heavySteelTemplate).toBeDefined();

      const copy = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "My Heavy Steel Shield",
        description: "A custom shield",
        type: "Shield",
        sourceItemId: heavySteelTemplate!.id,
      });

      const result = await ItemsMethods.getRulesetItem(ruleset.id, copy.id);
      const propMap = new Map(result.properties.map((p) => [p.type, p.value]));

      expect(propMap.get("SHIELD_PROFICIENCY")).toBe("Heavy");
      expect(propMap.get("SHIELD_TYPE")).toBe("Heavy Steel Shield");
      expect(propMap.get("SHIELD_AC_BONUS")).toBe("2");
      expect(propMap.get("ARMOR_CHECK_PENALTY")).toBe("-2");
      expect(propMap.get("ITEM_SPELL_FAILURE")).toBe("15");
    });

    test("should include shield template requirements", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const templates = await Items.findTemplates(db, { rulesetId: ruleset.id, type: "Shield" });
      const towerShieldTemplate = templates.find((t) => t.name === "Tower Shield");
      expect(towerShieldTemplate).toBeDefined();

      const copy = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "My Tower Shield",
        description: "A custom tower shield",
        type: "Shield",
        sourceItemId: towerShieldTemplate!.id,
      });

      const result = await ItemsMethods.getRulesetItem(ruleset.id, copy.id);
      expect(result.requirements.length).toBe(1);
      expect(result.requirements[0].target).toContain("towershieldproficiency");
    });
  });

  describe("template deletion guard", () => {
    test("should prevent deleting a template with copies", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const templates = await Items.findTemplates(db, { rulesetId: ruleset.id, type: "Armor" });
      const chainMailTemplate = templates.find((t) => t.name === "Chain Mail");

      // Create a copy
      await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "My Chain Mail",
        description: "A copy",
        type: "Armor",
        sourceItemId: chainMailTemplate!.id,
      });

      // Attempt to delete template should fail
      await expect(
        ItemsMethods.deleteRulesetItem(session, ruleset.id, chainMailTemplate!.id),
      ).rejects.toThrow("Cannot delete a template item that has copies referencing it");
    });

    test("should allow deleting a template without copies", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create a standalone template
      const [template] = await Items.create(db, {
        name: "Custom Template",
        description: "A test template",
        type: "Armor",
        rulesetId: ruleset.id,
        isTemplate: true,
      });

      // Should succeed
      const deleted = await ItemsMethods.deleteRulesetItem(session, ruleset.id, template.id);
      expect(deleted.id).toBe(template.id);
    });
  });
});
