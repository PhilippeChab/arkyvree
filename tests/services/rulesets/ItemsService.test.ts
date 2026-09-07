import { ItemsMethods } from "@/server/services/rulesets/ItemsService.ts";
import { ModifiersMethods } from "@/server/services/rulesets/customization/ModifiersService.ts";
import { PropertiesMethods } from "@/server/services/rulesets/customization/PropertiesService.ts";
import { RequirementsMethods } from "@/server/services/rulesets/customization/RequirementsService.ts";
import { invalidateAll } from "@/server/cache/rulesetCache.ts";
import { db } from "@/server/database/index.ts";
import { Abilities, Characters, EntitySnapshots, Modifiers, Properties, Races, Requirements, Rulesets, Users } from "@/server/repositories/index.ts";
import { inventoryInCharacter } from "@/drizzle/schema.ts";
import { ConflictError, NotFoundError, ForbiddenError, UnprocessableEntityError } from "@/server/errors/index.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, test, expect } from "bun:test";

describe("ItemsService", () => {
  // Helper to create test session
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

  // Helper to create test user and ruleset
  async function createTestUserAndRuleset() {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const users = await Users.create(db, {
      username: `testuser-${uniqueId}`,
      emailAddress: `test-${uniqueId}@example.com`,
      password: "password1234",
    });
    const user = users[0];

    const rulesets = await Rulesets.create(db, {
      name: `Test Ruleset ${uniqueId}`,
      description: "Test ruleset for items testing",
      private: true,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
    });
    const ruleset = rulesets[0];

    return { user, ruleset, session: createTestSession(user.id) };
  }

  // Seed the six standard D&D abilities so paths like `abilities.strength.misc`
  // validate. Mirrors the helper in ModifiersService.test.ts.
  async function seedAbilities(rulesetId: string) {
    await Abilities.createMany(db, [
      { name: "Strength", description: "Physical power", rulesetId },
      { name: "Dexterity", description: "Agility and reflexes", rulesetId },
      { name: "Constitution", description: "Health and stamina", rulesetId },
      { name: "Intelligence", description: "Reasoning and memory", rulesetId },
      { name: "Wisdom", description: "Perception and insight", rulesetId },
      { name: "Charisma", description: "Force of personality", rulesetId },
    ]);
  }

  describe("getRulesetItems", () => {
    test("should return items for a valid ruleset", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      const result = await ItemsMethods.getRulesetItems(ruleset.id, {}, { limit: 10, page: 1 });

      expect(result).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ItemsMethods.getRulesetItems(fakeRulesetId, {}, { limit: 10, page: 1 })
      ).rejects.toThrow(NotFoundError);
    });

    test("should return only items for the specified ruleset", async () => {
      const { ruleset: ruleset1, session: session1 } = await createTestUserAndRuleset();
      const { ruleset: ruleset2, session: session2 } = await createTestUserAndRuleset();

      // Create item in ruleset1
      const item1 = await ItemsMethods.createRulesetItem(session1, ruleset1.id, {
        name: "Ruleset 1 Item",
        description: "Item in ruleset 1",
      });

      // Create item in ruleset2
      await ItemsMethods.createRulesetItem(session2, ruleset2.id, {
        name: "Ruleset 2 Item",
        description: "Item in ruleset 2",
      });

      const result = await ItemsMethods.getRulesetItems(ruleset1.id, {}, { limit: 10, page: 1 });

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items.every((item) => item.rulesetId === ruleset1.id)).toBe(true);
      expect(result.items.some((item) => item.id === item1.id)).toBe(true);
    });
  });

  describe("getRulesetItem", () => {
    test("should return a specific item from a ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const created = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Test Item",
        description: "Test description",
        weight: 5,
        costGp: 100,
      });

      const item = await ItemsMethods.getRulesetItem(ruleset.id, created.id);

      expect(item).toBeDefined();
      expect(item.id).toBe(created.id);
      expect(item.name).toBe("Test Item");
      expect(item.description).toBe("Test description");
      expect(item.weight).toBe("5.00");
      expect(item.costGp).toBe("100.00");
      expect(item.rulesetId).toBe(ruleset.id);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ItemsMethods.getRulesetItem(fakeRulesetId, "fake-item-id")
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent item", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const fakeItemId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ItemsMethods.getRulesetItem(ruleset.id, fakeItemId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for item from different ruleset", async () => {
      const { ruleset: ruleset1, session: session1 } = await createTestUserAndRuleset();
      const { ruleset: ruleset2 } = await createTestUserAndRuleset();

      // Create item in ruleset1
      const item = await ItemsMethods.createRulesetItem(session1, ruleset1.id, {
        name: "Item in Ruleset 1",
        description: "Test",
      });

      // Try to get it from ruleset2
      await expect(
        ItemsMethods.getRulesetItem(ruleset2.id, item.id)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("createRulesetItem", () => {
    test("should create an item with all fields", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const itemData = {
        name: "Longsword",
        description: "A versatile weapon",
        weight: 4,
        costGp: 15,
      };

      const item = await ItemsMethods.createRulesetItem(
        session,
        ruleset.id,
        itemData
      );

      expect(item).toBeDefined();
      expect(item.name).toBe(itemData.name);
      expect(item.description).toBe(itemData.description);
      expect(item.weight).toBe("4.00");
      expect(item.costGp).toBe("15.00");
      expect(item.rulesetId).toBe(ruleset.id);
    });

    test("should create an item with minimal fields", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const itemData = {
        name: "Simple Item",
        description: "Basic description",
      };

      const item = await ItemsMethods.createRulesetItem(
        session,
        ruleset.id,
        itemData
      );

      expect(item).toBeDefined();
      expect(item.name).toBe(itemData.name);
      expect(item.description).toBe(itemData.description);
      expect(item.weight).toBeNull();
      expect(item.costGp).toBeNull();
      expect(item.rulesetId).toBe(ruleset.id);
    });

    test("should create an item with zero weight and cost", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const itemData = {
        name: "Weightless Item",
        description: "Has no weight or cost",
        weight: 0,
        costGp: 0,
      };

      const item = await ItemsMethods.createRulesetItem(
        session,
        ruleset.id,
        itemData
      );

      expect(item).toBeDefined();
      expect(item.weight).toBe("0.00");
      expect(item.costGp).toBe("0.00");
    });

    test("should create an item with decimal values", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const itemData = {
        name: "Light Item",
        description: "Very light and cheap",
        weight: 0.5,
        costGp: 2.25,
      };

      const item = await ItemsMethods.createRulesetItem(
        session,
        ruleset.id,
        itemData
      );

      expect(item).toBeDefined();
      expect(item.weight).toBe("0.50");
      expect(item.costGp).toBe("2.25");
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUserAndRuleset();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ItemsMethods.createRulesetItem(session, fakeRulesetId, {
          name: "Test",
          description: "Test",
        })
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();

      await expect(
        ItemsMethods.createRulesetItem(otherSession, ruleset.id, {
          name: "Test",
          description: "Test",
        })
      ).rejects.toThrow(ForbiddenError);
    });

    test("should force slot to Torso for Armor type", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const item = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Chainmail",
        description: "A suit of armor",
        type: "Armor",
        slot: "Other",
      });

      expect(item.slot).toBe("Torso");
    });

    test("should force slot to Off Hand for Shield type", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const item = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Buckler",
        description: "A small shield",
        type: "Shield",
        slot: "Other",
      });

      expect(item.slot).toBe("Off Hand");
    });

    test("should use provided slot for non-Armor/Shield types", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const item = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Ring of Protection",
        description: "A magical ring",
        slot: "Finger",
      });

      expect(item.slot).toBe("Finger");
    });

  });

  describe("duplicateRulesetItem", () => {
    test("copies modifiers, own properties, and own requirements from the source", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      await seedAbilities(ruleset.id);

      const source = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Source Item",
        description: "Has customizations",
      });

      await ModifiersMethods.createEntityModifier(session, ruleset.id, "items", source.id, {
        target: "abilities.strength.misc",
        value: "2",
        operator: "add",
      });
      await PropertiesMethods.createEntityProperty(session, ruleset.id, "items", source.id, {
        value: "Cold Resistance",
        type: "resistance",
        description: "Resists cold",
      });
      await RequirementsMethods.createEntityRequirement(session, ruleset.id, "items", source.id, {
        level: "1",
        target: "combat.bab",
        value: "5",
        operator: "greater_than_or_equal",
      });

      const dup = await ItemsMethods.duplicateRulesetItem(session, ruleset.id, source.id, {
        name: "Duplicate Item",
        description: "Has the source's customizations",
      });

      const dupModifiers = await Modifiers.findManyBySource(db, { sourceIds: [dup.id], sourceType: "items" });
      const dupProperties = await Properties.findManyByEntity(db, { entityIds: [dup.id], entityType: "items" });
      const dupRequirements = await Requirements.findManyByEntity(db, { entityIds: [dup.id], entityType: "items" });

      expect(dupModifiers).toHaveLength(1);
      expect(dupModifiers[0].target).toBe("abilities.strength.misc");
      expect(dupModifiers[0].value).toBe("2");
      expect(dupModifiers[0].operator).toBe("add");

      expect(dupProperties).toHaveLength(1);
      expect(dupProperties[0].value).toBe("Cold Resistance");
      expect(dupProperties[0].type).toBe("resistance");
      expect(dupProperties[0].description).toBe("Resists cold");

      expect(dupRequirements).toHaveLength(1);
      expect(dupRequirements[0].level).toBe("1");
      expect(dupRequirements[0].target).toBe("combat.bab");
      expect(dupRequirements[0].value).toBe("5");
      expect(dupRequirements[0].operator).toBe("greater_than_or_equal");
    });

    test("copies modifier requirements with remapped modifier ids", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      await seedAbilities(ruleset.id);

      const source = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Modifier Tree Source",
        description: "Source with modifier requirement tree",
      });

      const sourceModifier = await ModifiersMethods.createEntityModifier(session, ruleset.id, "items", source.id, {
        target: "abilities.strength.misc",
        value: "2",
        operator: "add",
      });
      await RequirementsMethods.createEntityRequirement(session, ruleset.id, "modifiers", sourceModifier.id, {
        level: "1",
        target: "combat.bab",
        value: "5",
        operator: "greater_than_or_equal",
      });

      const dup = await ItemsMethods.duplicateRulesetItem(session, ruleset.id, source.id, {
        name: "Modifier Tree Duplicate",
      });

      const dupModifiers = await Modifiers.findManyBySource(db, { sourceIds: [dup.id], sourceType: "items" });
      expect(dupModifiers).toHaveLength(1);
      const newModifierId = dupModifiers[0].id;
      expect(newModifierId).not.toBe(sourceModifier.id);

      const newModReqs = await Requirements.findManyByEntity(db, { entityIds: [newModifierId], entityType: "modifiers" });
      expect(newModReqs).toHaveLength(1);
      expect(newModReqs[0].target).toBe("combat.bab");
      expect(newModReqs[0].value).toBe("5");

      const oldModReqs = await Requirements.findManyByEntity(db, { entityIds: [sourceModifier.id], entityType: "modifiers" });
      expect(oldModReqs).toHaveLength(1);
      expect(oldModReqs[0].id).not.toBe(newModReqs[0].id);
    });

    test("throws NotFoundError when the source item is not in the ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const fakeId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ItemsMethods.duplicateRulesetItem(session, ruleset.id, fakeId, {
          name: "No Source",
        }),
      ).rejects.toThrow(NotFoundError);
    });

    test("duplicate of a template becomes a pure instance of that template with no own customizations", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      await seedAbilities(ruleset.id);

      const template = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Sword Template",
        isTemplate: true,
      });

      await PropertiesMethods.createEntityProperty(session, ruleset.id, "items", template.id, {
        value: "Slashing",
        type: "damage_type",
      });
      await RequirementsMethods.createEntityRequirement(session, ruleset.id, "items", template.id, {
        level: "1",
        target: "combat.bab",
        value: "3",
        operator: "greater_than_or_equal",
      });

      const dup = await ItemsMethods.duplicateRulesetItem(session, ruleset.id, template.id, {
        name: "Sword Instance",
      });

      expect(dup.sourceItemId).toBe(template.id);
      expect(dup.isTemplate).toBe(false);

      const dupProperties = await Properties.findManyByEntity(db, { entityIds: [dup.id], entityType: "items" });
      const dupRequirements = await Requirements.findManyByEntity(db, { entityIds: [dup.id], entityType: "items" });
      const dupModifiers = await Modifiers.findManyBySource(db, { sourceIds: [dup.id], sourceType: "items" });
      expect(dupProperties).toHaveLength(0);
      expect(dupRequirements).toHaveLength(0);
      expect(dupModifiers).toHaveLength(0);

      const view = await ItemsMethods.getRulesetItem(ruleset.id, dup.id);
      expect(view.properties).toHaveLength(1);
      expect(view.properties[0].value).toBe("Slashing");
      expect(view.requirements).toHaveLength(1);
      expect(view.requirements[0].target).toBe("combat.bab");
    });

    test("modifiers on a template are not visible on duplicates — modifiers do not inherit via sourceItemId", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      await seedAbilities(ruleset.id);

      const template = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Template With Modifier",
        isTemplate: true,
      });
      await ModifiersMethods.createEntityModifier(session, ruleset.id, "items", template.id, {
        target: "abilities.strength.misc",
        value: "1",
        operator: "add",
      });

      const dup = await ItemsMethods.duplicateRulesetItem(session, ruleset.id, template.id, {
        name: "Template Instance",
      });

      expect(dup.sourceItemId).toBe(template.id);
      const dupModifiers = await Modifiers.findManyBySource(db, { sourceIds: [dup.id], sourceType: "items" });
      expect(dupModifiers).toHaveLength(0);

      const view = await ItemsMethods.getRulesetItem(ruleset.id, dup.id);
      expect(view.modifiers).toHaveLength(0);
    });
  });

  describe("updateRulesetItem", () => {
    test("should update all item fields", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create item first
      const created = await ItemsMethods.createRulesetItem(
        session,
        ruleset.id,
        {
          name: "Original Name",
          description: "Original description",
          weight: 5,
          costGp: 50,
        }
      );

      // Update it
      const updateData = {
        name: "Updated Name",
        description: "Updated description",
        weight: 10,
        costGp: 100,
      };

      const updated = await ItemsMethods.updateRulesetItem(
        session,
        ruleset.id,
        created.id,
        updateData
      );

      expect(updated.name).toBe(updateData.name);
      expect(updated.description).toBe(updateData.description);
      expect(updated.weight).toBe("10.00");
      expect(updated.costGp).toBe("100.00");
      expect(updated.id).toBe(created.id);
    });

    test("should update item without weight and cost", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const created = await ItemsMethods.createRulesetItem(
        session,
        ruleset.id,
        {
          name: "Original Name",
          description: "Original description",
          weight: 5,
          costGp: 50,
        }
      );

      const updateData = {
        name: "Updated Name",
        description: "Updated description",
      };

      const updated = await ItemsMethods.updateRulesetItem(
        session,
        ruleset.id,
        created.id,
        updateData
      );

      expect(updated.name).toBe(updateData.name);
      expect(updated.description).toBe(updateData.description);
    });

    test("should update weight and cost to zero", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const created = await ItemsMethods.createRulesetItem(
        session,
        ruleset.id,
        {
          name: "Item",
          description: "Description",
          weight: 5,
          costGp: 50,
        }
      );

      const updated = await ItemsMethods.updateRulesetItem(
        session,
        ruleset.id,
        created.id,
        {
          name: "Item",
          description: "Description",
          weight: 0,
          costGp: 0,
        }
      );

      expect(updated.weight).toBe("0.00");
      expect(updated.costGp).toBe("0.00");
    });

    test("should force slot to Torso when type changes to Armor", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const created = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Generic Item",
        description: "An item",
        slot: "Other",
      });

      const updated = await ItemsMethods.updateRulesetItem(session, ruleset.id, created.id, {
        name: "Generic Item",
        description: "Now it's armor",
        type: "Armor",
        slot: "Other",
      });

      expect(updated.slot).toBe("Torso");
    });

    test("should force slot to Off Hand when type changes to Shield", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const created = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Generic Item",
        description: "An item",
        slot: "Other",
      });

      const updated = await ItemsMethods.updateRulesetItem(session, ruleset.id, created.id, {
        name: "Generic Item",
        description: "Now it's a shield",
        type: "Shield",
        slot: "Other",
      });

      expect(updated.slot).toBe("Off Hand");
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUserAndRuleset();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ItemsMethods.updateRulesetItem(
          session,
          fakeRulesetId,
          "fake-item-id",
          { name: "Test", description: "Test" }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent item", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const fakeItemId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ItemsMethods.updateRulesetItem(
          session,
          ruleset.id,
          fakeItemId,
          { name: "Test", description: "Test" }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for item from different ruleset", async () => {
      const { ruleset: ruleset1, session: session1 } = await createTestUserAndRuleset();
      const { ruleset: ruleset2, session: session2 } = await createTestUserAndRuleset();

      // Create item in ruleset1
      const item = await ItemsMethods.createRulesetItem(session1, ruleset1.id, {
        name: "Item",
        description: "Description",
      });

      // Try to update it in ruleset2 context (even as the owner of ruleset2)
      await expect(
        ItemsMethods.updateRulesetItem(
          session2,
          ruleset2.id,
          item.id,
          { name: "Updated", description: "Updated" }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();

      // Create item as owner
      const item = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Test",
        description: "Test",
      });

      // Try to update as different user
      await expect(
        ItemsMethods.updateRulesetItem(
          otherSession,
          ruleset.id,
          item.id,
          { name: "Updated", description: "Updated" }
        )
      ).rejects.toThrow(ForbiddenError);
    });

    test("should throw ConflictError when updatedAt is stale", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const created = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Original",
        description: "Original",
      });

      // First contributor saves — succeeds and bumps updatedAt.
      await ItemsMethods.updateRulesetItem(session, ruleset.id, created.id, {
        name: "First edit",
        description: "First edit",
        updatedAt: created.updatedAt,
      });

      // Second contributor submits with the original updatedAt — must reject.
      await expect(
        ItemsMethods.updateRulesetItem(session, ruleset.id, created.id, {
          name: "Second edit",
          description: "Second edit",
          updatedAt: created.updatedAt,
        })
      ).rejects.toThrow(ConflictError);
    });

    test("should skip CAS check when updatedAt is omitted", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const created = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Original",
        description: "Original",
      });

      // First save bumps updatedAt.
      await ItemsMethods.updateRulesetItem(session, ruleset.id, created.id, {
        name: "First edit",
        description: "First edit",
        updatedAt: created.updatedAt,
      });

      // Second save without updatedAt — must still succeed (no CAS opt-in).
      const updated = await ItemsMethods.updateRulesetItem(session, ruleset.id, created.id, {
        name: "Second edit",
        description: "Second edit",
      });
      expect(updated.name).toBe("Second edit");
    });

    test("should throw NotFoundError when item was deleted between load and update", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const created = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Doomed",
        description: "About to be deleted",
      });

      await ItemsMethods.deleteRulesetItem(session, ruleset.id, created.id);

      await expect(
        ItemsMethods.updateRulesetItem(session, ruleset.id, created.id, {
          name: "Too late",
          description: "Stale edit",
          updatedAt: created.updatedAt,
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("deleteRulesetItem", () => {
    test("should delete an item", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create item first
      const created = await ItemsMethods.createRulesetItem(
        session,
        ruleset.id,
        { name: "To Delete", description: "Will be deleted" }
      );

      // Delete it
      const deleted = await ItemsMethods.deleteRulesetItem(
        session,
        ruleset.id,
        created.id
      );

      expect(deleted).toBeDefined();
      expect(deleted.id).toBe(created.id);

      // Verify it's deleted by trying to get it
      await expect(
        ItemsMethods.getRulesetItem(ruleset.id, created.id)
      ).rejects.toThrow(NotFoundError);
    });

    test("should delete item from list", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const created = await ItemsMethods.createRulesetItem(
        session,
        ruleset.id,
        { name: "To Delete", description: "Will be deleted" }
      );

      await ItemsMethods.deleteRulesetItem(session, ruleset.id, created.id);

      const result = await ItemsMethods.getRulesetItems(ruleset.id, {}, { limit: 10, page: 1 });
      expect(result.items.find((item) => item.id === created.id)).toBeUndefined();
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUserAndRuleset();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ItemsMethods.deleteRulesetItem(
          session,
          fakeRulesetId,
          "fake-item-id"
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent item", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const fakeItemId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ItemsMethods.deleteRulesetItem(
          session,
          ruleset.id,
          fakeItemId
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for item from different ruleset", async () => {
      const { ruleset: ruleset1, session: session1 } = await createTestUserAndRuleset();
      const { ruleset: ruleset2, session: session2 } = await createTestUserAndRuleset();

      // Create item in ruleset1
      const item = await ItemsMethods.createRulesetItem(session1, ruleset1.id, {
        name: "Item",
        description: "Description",
      });

      // Try to delete it in ruleset2 context
      await expect(
        ItemsMethods.deleteRulesetItem(session2, ruleset2.id, item.id)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();

      // Create item as owner
      const item = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Test",
        description: "Test",
      });

      // Try to delete as different user
      await expect(
        ItemsMethods.deleteRulesetItem(
          otherSession,
          ruleset.id,
          item.id
        )
      ).rejects.toThrow(ForbiddenError);
    });

    test("should block deletion when a host subscribed to this extension has a character with the item in inventory", async () => {
      const { user, ruleset: extension, session } = await createTestUserAndRuleset();
      const item = await ItemsMethods.createRulesetItem(session, extension.id, {
        name: "Extension Item",
        description: "Test",
      });

      const hostRows = await Rulesets.create(db, {
        name: `Host ${Math.random().toString(36).substr(2, 9)}`,
        description: "Subscribes to extension",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: user.id,
        extensionRulesetIds: [extension.id],
      });
      const host = hostRows[0];
      const races = await Races.create(db, { name: `Race ${Math.random().toString(36).substr(2, 9)}`, description: "Test", rulesetId: host.id, size: "Medium", baseSpeed: 30 });
      const characters = await Characters.create(db, { name: "Subscriber", userId: user.id, rulesetId: host.id, raceId: races[0].id, xp: 0, alignment: "Neutral Good", age: 25, gender: "Male", height: "180", weight: "75" });
      await db.insert(inventoryInCharacter).values({ characterId: characters[0].id, itemId: item.id, quantity: 1 });

      await expect(
        ItemsMethods.deleteRulesetItem(session, extension.id, item.id),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("COW fork", () => {
    test("should throw ConflictError when creating item with name inherited from parent", async () => {
      const { ruleset: parentRuleset, session: parentSession } = await createTestUserAndRuleset();
      await Rulesets.update(db, { status: "Published" }, { id: parentRuleset.id });

      await ItemsMethods.createRulesetItem(parentSession, parentRuleset.id, {
        name: "Longsword",
        description: "A versatile weapon",
      });

      const { session: childSession } = await createTestUserAndRuleset();
      const childRulesets = await Rulesets.create(db, {
        name: `Fork ${Math.random().toString(36).substr(2, 9)}`,
        description: "COW fork",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: childSession.userId,
        rulesetId: parentRuleset.id,
        ancestorRulesetIds: [parentRuleset.id],
      });
      const childRuleset = childRulesets[0];

      await expect(
        ItemsMethods.createRulesetItem(childSession, childRuleset.id, {
          name: "Longsword",
          description: "Duplicate name",
        }),
      ).rejects.toThrow(ConflictError);
    });

    test("getRulesetItem using parent itemId after COW should return fork's own requirements", async () => {
      // Create parent with an item that has a requirement
      const { ruleset: parentRuleset, session: parentSession } = await createTestUserAndRuleset();
      await Rulesets.update(db, { status: "Published" }, { id: parentRuleset.id });

      const parentItem = await ItemsMethods.createRulesetItem(parentSession, parentRuleset.id, {
        name: "Magic Ring",
        description: "A ring of power",
      });

      // Add a requirement to the parent item
      await Requirements.createMany(db, [{
        entityId: parentItem.id,
        entityType: "items",
        level: "1",
        target: "abilities.strength.misc",
        value: "10",
        valueType: "number",
        operator: "greater_than_or_equal",
      }]);

      // Fork
      const { session: forkSession } = await createTestUserAndRuleset();
      const forkRulesets = await Rulesets.create(db, {
        name: `Fork ${Math.random().toString(36).substr(2, 9)}`,
        description: "COW fork",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: forkSession.userId,
        rulesetId: parentRuleset.id,
        ancestorRulesetIds: [parentRuleset.id],
      });
      const forkRuleset = forkRulesets[0];

      // COW the item by updating it in the fork
      await ItemsMethods.updateRulesetItem(forkSession, forkRuleset.id, parentItem.id, {
        name: "Magic Ring",
        description: "Updated description",
      });
      invalidateAll();

      // Verify snapshot was created (COW happened)
      const snapshot = await EntitySnapshots.findBySourceAndRuleset(db, {
        sourceEntityId: parentItem.id,
        rulesetId: forkRuleset.id,
      });
      expect(snapshot).toBeDefined();

      // Now fetch the item via parent ID — should resolve through overrideMap
      const itemFromFork = await ItemsMethods.getRulesetItem(forkRuleset.id, parentItem.id);

      // The COW'd item should have its own copy of requirements
      expect(itemFromFork.requirements.length).toBe(1);
      expect(itemFromFork.requirements[0].entityId).toBe(snapshot!.forkedEntityId);
      expect(itemFromFork.requirements[0].value).toBe("10");

      // Verify parent is unchanged
      const parentItemResult = await ItemsMethods.getRulesetItem(parentRuleset.id, parentItem.id);
      expect(parentItemResult.requirements.length).toBe(1);
      expect(parentItemResult.requirements[0].entityId).toBe(parentItem.id);
    });
  });

  describe("bulkCreateVariants", () => {
    test("should create N variants copying type/slot/cost/weight from source", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const source = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Scroll",
        description: "A blank scroll",
        type: "Other",
        slot: "Other",
        weight: 0.1,
        costGp: 25,
      });

      const created = await ItemsMethods.bulkCreateVariants(session, ruleset.id, source.id, [
        { name: "Scroll of Healing", description: "Heals 1d8 HP" },
        { name: "Scroll of Greater Healing", description: "Heals 4d8 HP" },
        { name: "Scroll of Cure Light Wounds" },
      ]);

      expect(created).toHaveLength(3);
      expect(created.map((i) => i.name)).toEqual([
        "Scroll of Healing",
        "Scroll of Greater Healing",
        "Scroll of Cure Light Wounds",
      ]);
      for (const item of created) {
        expect(item.rulesetId).toBe(ruleset.id);
        expect(item.type).toBe("Other");
        expect(item.slot).toBe("Other");
        expect(item.weight).toBe("0.10");
        expect(item.costGp).toBe("25.00");
        expect(item.sourceItemId).toBeNull();
        expect(item.isTemplate).toBe(false);
      }
      // Per-variant description is honored verbatim; blank means blank
      // (no silent fallback to the source's description).
      expect(created[0].description).toBe("Heals 1d8 HP");
      expect(created[2].description).toBeNull();
    });

    test("should throw NotFoundError when source item is not in ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const fakeItemId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ItemsMethods.bulkCreateVariants(session, ruleset.id, fakeItemId, [{ name: "X" }]),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const source = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Scroll",
        description: "A blank scroll",
      });

      const { session: otherSession } = await createTestUserAndRuleset();

      await expect(
        ItemsMethods.bulkCreateVariants(otherSession, ruleset.id, source.id, [{ name: "Variant" }]),
      ).rejects.toThrow(ForbiddenError);
    });

    test("should throw UnprocessableEntityError when variants array is empty", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const source = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Scroll",
        description: "A blank scroll",
      });

      await expect(
        ItemsMethods.bulkCreateVariants(session, ruleset.id, source.id, []),
      ).rejects.toThrow(UnprocessableEntityError);
    });

    test("should throw UnprocessableEntityError when over the 50 cap", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const source = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Scroll",
        description: "A blank scroll",
      });

      const tooMany = Array.from({ length: 51 }, (_, i) => ({ name: `Variant ${i}` }));

      await expect(
        ItemsMethods.bulkCreateVariants(session, ruleset.id, source.id, tooMany),
      ).rejects.toThrow(UnprocessableEntityError);
    });

    test("should throw ConflictError on duplicate names within the variants array", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const source = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Dedupe Source",
        description: "Source for dedupe test",
      });

      await expect(
        ItemsMethods.bulkCreateVariants(session, ruleset.id, source.id, [
          { name: "Dedupe Sibling" },
          { name: "Dedupe Sibling" }, // same name twice in one call
        ]),
      ).rejects.toThrow(ConflictError);

      // Neither row should have leaked past the early rejection
      const list = await ItemsMethods.getRulesetItems(
        ruleset.id,
        { search: "Dedupe Sibling" },
        { limit: 10, page: 1 },
      );
      expect(list.items.map((i) => i.name)).not.toContain("Dedupe Sibling");
    });

    test("should rollback all variants when one name conflicts", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const source = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Source Scroll",
        description: "A blank scroll",
      });

      await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Pre-existing Variant",
        description: "Already there",
      });

      await expect(
        ItemsMethods.bulkCreateVariants(session, ruleset.id, source.id, [
          { name: "Rollback Probe Alpha" },
          { name: "Pre-existing Variant" }, // conflict
          { name: "Rollback Probe Beta" },
        ]),
      ).rejects.toThrow(ConflictError);

      // The pre-throw variant must not have leaked past the rollback
      const list = await ItemsMethods.getRulesetItems(
        ruleset.id,
        { search: "Rollback Probe" },
        { limit: 50, page: 1 },
      );
      const names = list.items.map((i) => i.name);
      expect(names).not.toContain("Rollback Probe Alpha");
      expect(names).not.toContain("Rollback Probe Beta");
    });

    test("should resolve source item inherited from a parent ruleset (COW fork)", async () => {
      const { ruleset: parentRuleset, session: parentSession } = await createTestUserAndRuleset();
      await Rulesets.update(db, { status: "Published" }, { id: parentRuleset.id });

      const parentItem = await ItemsMethods.createRulesetItem(parentSession, parentRuleset.id, {
        name: "Parent Scroll",
        description: "From the parent",
        weight: 0.1,
        costGp: 25,
      });

      const { session: forkSession } = await createTestUserAndRuleset();
      const forkRulesets = await Rulesets.create(db, {
        name: `Fork ${Math.random().toString(36).substr(2, 9)}`,
        description: "COW fork",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: forkSession.userId,
        rulesetId: parentRuleset.id,
        ancestorRulesetIds: [parentRuleset.id],
      });
      const forkRuleset = forkRulesets[0];
      invalidateAll();

      const created = await ItemsMethods.bulkCreateVariants(forkSession, forkRuleset.id, parentItem.id, [
        { name: "Forked Variant A" },
        { name: "Forked Variant B" },
      ]);

      expect(created).toHaveLength(2);
      for (const item of created) {
        expect(item.rulesetId).toBe(forkRuleset.id);
        expect(item.weight).toBe("0.10");
        expect(item.costGp).toBe("25.00");
      }
    });

    test("should repoint tombstone snapshot when a bulk variant re-uses a name that was override-deleted in the fork", async () => {
      // Parent ruleset with an item that the fork will override-delete.
      const { ruleset: parent, session: parentSession } = await createTestUserAndRuleset();
      const parentItem = await ItemsMethods.createRulesetItem(parentSession, parent.id, {
        name: "Ghostly Scroll",
        description: "Inherited from parent",
        weight: 0.1,
        costGp: 25,
      });
      const source = await ItemsMethods.createRulesetItem(parentSession, parent.id, {
        name: "Bulk Source",
        description: "Source for bulk variants",
        weight: 0.1,
        costGp: 25,
      });

      await Rulesets.update(db, { status: "Published" }, { id: parent.id });

      const { RulesetsMethods } = await import("@/server/services/RulesetsService.ts");
      const fork = await RulesetsMethods.forkRuleset(parentSession, parent.id, {
        name: `Fork ${Math.random().toString(36).substr(2, 6)}`,
        private: true,
      });

      // COW + override-delete in the fork: edit (creates snapshot), then delete (hard-deletes the COW row, leaves tombstone).
      const cow = await ItemsMethods.updateRulesetItem(parentSession, fork.id, parentItem.id, {
        name: "Ghostly Scroll",
        description: "Edited in fork",
      });
      expect(cow.id).not.toBe(parentItem.id);
      await ItemsMethods.deleteRulesetItem(parentSession, fork.id, cow.id);
      invalidateAll();

      // Bulk-create with the same name as the parent item — the tombstone excuses the ancestor conflict and gets repointed.
      const created = await ItemsMethods.bulkCreateVariants(parentSession, fork.id, source.id, [
        { name: "Ghostly Scroll" },
      ]);

      expect(created).toHaveLength(1);
      const newItem = created[0];

      const snapshots = await EntitySnapshots.findByTypeAndRuleset(db, {
        rulesetId: fork.id,
        entityType: "items",
      });
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].sourceEntityId).toBe(parentItem.id);
      expect(snapshots[0].forkedEntityId).toBe(newItem.id);
    });

    test("copies modifiers, own properties, and own requirements from the source onto each variant", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      await seedAbilities(ruleset.id);

      const source = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Bulk Source",
        description: "Source for variants",
        weight: 1,
        costGp: 10,
      });

      await ModifiersMethods.createEntityModifier(session, ruleset.id, "items", source.id, {
        target: "abilities.strength.misc",
        value: "2",
        operator: "add",
      });
      await PropertiesMethods.createEntityProperty(session, ruleset.id, "items", source.id, {
        value: "Fire Resistance",
        type: "resistance",
      });
      await RequirementsMethods.createEntityRequirement(session, ruleset.id, "items", source.id, {
        level: "1",
        target: "combat.bab",
        value: "3",
        operator: "greater_than_or_equal",
      });

      const created = await ItemsMethods.bulkCreateVariants(session, ruleset.id, source.id, [
        { name: "Variant A" },
        { name: "Variant B" },
      ]);

      expect(created).toHaveLength(2);
      for (const v of created) {
        const mods = await Modifiers.findManyBySource(db, { sourceIds: [v.id], sourceType: "items" });
        const props = await Properties.findManyByEntity(db, { entityIds: [v.id], entityType: "items" });
        const reqs = await Requirements.findManyByEntity(db, { entityIds: [v.id], entityType: "items" });

        expect(mods).toHaveLength(1);
        expect(mods[0].target).toBe("abilities.strength.misc");
        expect(props).toHaveLength(1);
        expect(props[0].value).toBe("Fire Resistance");
        expect(reqs).toHaveLength(1);
        expect(reqs[0].target).toBe("combat.bab");
      }

      // Source still owns its originals
      const sourceMods = await Modifiers.findManyBySource(db, { sourceIds: [source.id], sourceType: "items" });
      expect(sourceMods).toHaveLength(1);
    });

    test("variants of a template are pure instances of that template with no own customizations", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      await seedAbilities(ruleset.id);

      const template = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Bow Template",
        isTemplate: true,
      });
      await PropertiesMethods.createEntityProperty(session, ruleset.id, "items", template.id, {
        value: "Piercing",
        type: "damage_type",
      });
      await RequirementsMethods.createEntityRequirement(session, ruleset.id, "items", template.id, {
        level: "1",
        target: "combat.bab",
        value: "1",
        operator: "greater_than_or_equal",
      });

      const created = await ItemsMethods.bulkCreateVariants(session, ruleset.id, template.id, [
        { name: "Bow +1" },
        { name: "Bow +2" },
      ]);

      expect(created).toHaveLength(2);
      for (const v of created) {
        expect(v.sourceItemId).toBe(template.id);
        expect(v.isTemplate).toBe(false);

        const mods = await Modifiers.findManyBySource(db, { sourceIds: [v.id], sourceType: "items" });
        const props = await Properties.findManyByEntity(db, { entityIds: [v.id], entityType: "items" });
        const reqs = await Requirements.findManyByEntity(db, { entityIds: [v.id], entityType: "items" });
        expect(mods).toHaveLength(0);
        expect(props).toHaveLength(0);
        expect(reqs).toHaveLength(0);

        const view = await ItemsMethods.getRulesetItem(ruleset.id, v.id);
        expect(view.properties).toHaveLength(1);
        expect(view.properties[0].value).toBe("Piercing");
        expect(view.requirements).toHaveLength(1);
        expect(view.requirements[0].target).toBe("combat.bab");
      }
    });

    test("variants inherit the source's template link so template customizations show at read time", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      await seedAbilities(ruleset.id);

      const template = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Weapon Template",
        isTemplate: true,
      });
      await PropertiesMethods.createEntityProperty(session, ruleset.id, "items", template.id, {
        value: "Slashing",
        type: "damage_type",
      });

      const source = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Longsword",
        sourceItemId: template.id,
      });

      const created = await ItemsMethods.bulkCreateVariants(session, ruleset.id, source.id, [
        { name: "Longsword +1" },
        { name: "Longsword +2" },
      ]);

      expect(created).toHaveLength(2);
      for (const v of created) {
        expect(v.sourceItemId).toBe(template.id);
        const view = await ItemsMethods.getRulesetItem(ruleset.id, v.id);
        expect(view.properties.some((p) => p.value === "Slashing" && p.type === "damage_type")).toBe(true);
      }
    });

    test("copies modifier requirements onto each variant with per-variant remapped modifier ids", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      await seedAbilities(ruleset.id);

      const source = await ItemsMethods.createRulesetItem(session, ruleset.id, {
        name: "Bulk Source With Modifier Reqs",
      });

      const sourceModifier = await ModifiersMethods.createEntityModifier(session, ruleset.id, "items", source.id, {
        target: "abilities.strength.misc",
        value: "2",
        operator: "add",
      });
      await RequirementsMethods.createEntityRequirement(session, ruleset.id, "modifiers", sourceModifier.id, {
        level: "1",
        target: "combat.bab",
        value: "5",
        operator: "greater_than_or_equal",
      });

      const created = await ItemsMethods.bulkCreateVariants(session, ruleset.id, source.id, [
        { name: "Var X" },
        { name: "Var Y" },
      ]);

      expect(created).toHaveLength(2);
      const allNewModifierIds = new Set<string>();
      for (const v of created) {
        const mods = await Modifiers.findManyBySource(db, { sourceIds: [v.id], sourceType: "items" });
        expect(mods).toHaveLength(1);
        expect(mods[0].id).not.toBe(sourceModifier.id);
        allNewModifierIds.add(mods[0].id);

        const modReqs = await Requirements.findManyByEntity(db, { entityIds: [mods[0].id], entityType: "modifiers" });
        expect(modReqs).toHaveLength(1);
        expect(modReqs[0].target).toBe("combat.bab");
        expect(modReqs[0].value).toBe("5");
      }

      // Each variant got its own new modifier (no id reuse across variants)
      expect(allNewModifierIds.size).toBe(2);

      // Source modifier requirement was not repointed
      const sourceModReqs = await Requirements.findManyByEntity(db, { entityIds: [sourceModifier.id], entityType: "modifiers" });
      expect(sourceModReqs).toHaveLength(1);
    });
  });
});
