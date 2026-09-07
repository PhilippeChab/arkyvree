import { PropertiesMethods } from "@/server/services/rulesets/customization/PropertiesService.ts";
import { db } from "@/server/database/index.ts";
import { Activities, Items, Rulesets, Users, Feats, Aptitudes, Properties } from "@/server/repositories/index.ts";
import { propertiesInCustomization } from "@/drizzle/schema.ts";
import { BadRequestError, NotFoundError, ForbiddenError } from "@/server/errors/index.ts";
import { getTableName } from "drizzle-orm";
import type { Session } from "@/shared/relations.ts";
import { describe, test, expect } from "bun:test";

describe("PropertiesService", () => {
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

  // Helper to create test user, ruleset, aptitude, and feat
  async function createTestUserAndFeat() {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const users = await Users.create(db, {
      username: `testuser-${uniqueId}`,
      emailAddress: `test-${uniqueId}@example.com`,
      password: "password1234",
    });
    const user = users[0];

    const rulesets = await Rulesets.create(db, {
      name: `Test Ruleset ${uniqueId}`,
      description: "Test ruleset for properties testing",
      private: true,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
    });
    const ruleset = rulesets[0];

    // Create an aptitude (required for feats)
    const aptitudes = await Aptitudes.create(db, {
      name: `Test Aptitude ${uniqueId}`,
      description: "Test aptitude for properties testing",
      rulesetId: ruleset.id,
    });
    const aptitude = aptitudes[0];

    // Create a feat to use as entity for properties
    const feats = await Feats.create(db, {
      name: `Test Feat ${uniqueId}`,
      description: "Test feat for properties testing",
      rulesetId: ruleset.id,
    });
    const feat = feats[0];

    return {
      user,
      ruleset,
      aptitude,
      feat,
      session: createTestSession(user.id),
    };
  }

  describe("getEntityProperties", () => {
    test("should return properties for a valid entity", async () => {
      const { ruleset, feat } = await createTestUserAndFeat();

      // Create a property first
      await Properties.create(db, {
        entityId: feat.id,
        entityType: "feats",
        value: "Fire Resistance",
        type: "resistance",
        description: "Provides resistance to fire damage",
      });

      const properties = await PropertiesMethods.getEntityProperties(
        ruleset.id,
        "feats",
        feat.id
      );

      expect(properties).toBeDefined();
      expect(Array.isArray(properties)).toBe(true);
      expect(properties.length).toBeGreaterThan(0);
      expect(properties[0].value).toBe("Fire Resistance");
      expect(properties[0].type).toBe("resistance");
    });

    test("should return empty array when entity has no properties", async () => {
      const { ruleset, feat } = await createTestUserAndFeat();

      const properties = await PropertiesMethods.getEntityProperties(
        ruleset.id,
        "feats",
        feat.id
      );

      expect(properties).toBeDefined();
      expect(Array.isArray(properties)).toBe(true);
      expect(properties.length).toBe(0);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { feat } = await createTestUserAndFeat();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        PropertiesMethods.getEntityProperties(fakeRulesetId, "feats", feat.id)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent entity", async () => {
      const { ruleset } = await createTestUserAndFeat();
      const fakeEntityId = "00000000-0000-0000-0000-000000000000";

      await expect(
        PropertiesMethods.getEntityProperties(ruleset.id, "feats", fakeEntityId)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("createEntityProperty", () => {
    test("should create a property with all fields", async () => {
      const { ruleset, feat, session } = await createTestUserAndFeat();

      const propertyData = {
        value: "Cold Resistance",
        type: "resistance",
        description: "Provides resistance to cold damage",
      };

      const property = await PropertiesMethods.createEntityProperty(
        session,
        ruleset.id,
        "feats",
        feat.id,
        propertyData
      );

      expect(property).toBeDefined();
      expect(property.value).toBe(propertyData.value);
      expect(property.type).toBe(propertyData.type);
      expect(property.description).toBe(propertyData.description);
      expect(property.entityId).toBe(feat.id);
      expect(property.entityType).toBe("feats");
    });

    test("should create a property with minimal fields", async () => {
      const { ruleset, feat, session } = await createTestUserAndFeat();

      const propertyData = {
        value: "Lightning Resistance",
        type: "resistance",
      };

      const property = await PropertiesMethods.createEntityProperty(
        session,
        ruleset.id,
        "feats",
        feat.id,
        propertyData
      );

      expect(property).toBeDefined();
      expect(property.value).toBe(propertyData.value);
      expect(property.type).toBe(propertyData.type);
      expect(property.description).toBeNull();
      expect(property.entityId).toBe(feat.id);
      expect(property.entityType).toBe("feats");
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { feat, session } = await createTestUserAndFeat();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        PropertiesMethods.createEntityProperty(
          session,
          fakeRulesetId,
          "feats",
          feat.id,
          {
            value: "Test",
            type: "test",
          }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent entity", async () => {
      const { ruleset, session } = await createTestUserAndFeat();
      const fakeEntityId = "00000000-0000-0000-0000-000000000000";

      await expect(
        PropertiesMethods.createEntityProperty(
          session,
          ruleset.id,
          "feats",
          fakeEntityId,
          {
            value: "Test",
            type: "test",
          }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, feat } = await createTestUserAndFeat();
      const { session: otherSession } = await createTestUserAndFeat();

      await expect(
        PropertiesMethods.createEntityProperty(
          otherSession,
          ruleset.id,
          "feats",
          feat.id,
          {
            value: "Test",
            type: "test",
          }
        )
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("updateEntityProperty", () => {
    test("should update a property", async () => {
      const { ruleset, feat, session } = await createTestUserAndFeat();

      // Create property first
      const created = await PropertiesMethods.createEntityProperty(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          value: "Original Value",
          type: "original_type",
          description: "Original description",
        }
      );

      // Update it
      const updateData = {
        value: "Updated Value",
        type: "updated_type",
        description: "Updated description",
      };

      const updated = await PropertiesMethods.updateEntityProperty(
        session,
        ruleset.id,
        "feats",
        feat.id,
        created.id,
        updateData
      );

      expect(updated.value).toBe(updateData.value);
      expect(updated.type).toBe(updateData.type);
      expect(updated.description).toBe(updateData.description);
      expect(updated.id).toBe(created.id);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { feat, session } = await createTestUserAndFeat();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        PropertiesMethods.updateEntityProperty(
          session,
          fakeRulesetId,
          "feats",
          feat.id,
          "fake-property-id",
          {
            value: "Test",
            type: "test",
          }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent property", async () => {
      const { ruleset, feat, session } = await createTestUserAndFeat();
      const fakePropertyId = "00000000-0000-0000-0000-000000000000";

      await expect(
        PropertiesMethods.updateEntityProperty(
          session,
          ruleset.id,
          "feats",
          feat.id,
          fakePropertyId,
          {
            value: "Test",
            type: "test",
          }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when property doesn't belong to entity", async () => {
      const { ruleset, feat, session } = await createTestUserAndFeat();
      const { feat: otherFeat } = await createTestUserAndFeat();

      // Create property for first feat
      const property = await PropertiesMethods.createEntityProperty(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          value: "Test",
          type: "test",
        }
      );

      // Try to update it as if it belongs to a different feat
      await expect(
        PropertiesMethods.updateEntityProperty(
          session,
          ruleset.id,
          "feats",
          otherFeat.id,
          property.id,
          {
            value: "Updated",
            type: "test",
          }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when property entityType doesn't match", async () => {
      const { ruleset, feat, session } = await createTestUserAndFeat();

      // Create property for feat
      const property = await PropertiesMethods.createEntityProperty(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          value: "Test",
          type: "test",
        }
      );

      // Try to update it with wrong entityType
      await expect(
        PropertiesMethods.updateEntityProperty(
          session,
          ruleset.id,
          "items",
          feat.id,
          property.id,
          {
            value: "Updated",
            type: "test",
          }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, feat, session } = await createTestUserAndFeat();
      const { session: otherSession } = await createTestUserAndFeat();

      // Create property as owner
      const property = await PropertiesMethods.createEntityProperty(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          value: "Test",
          type: "test",
        }
      );

      // Try to update as different user
      await expect(
        PropertiesMethods.updateEntityProperty(
          otherSession,
          ruleset.id,
          "feats",
          feat.id,
          property.id,
          {
            value: "Updated",
            type: "test",
          }
        )
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("deleteEntityProperty", () => {
    test("should delete a property", async () => {
      const { ruleset, feat, session } = await createTestUserAndFeat();

      // Create property first
      const created = await PropertiesMethods.createEntityProperty(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          value: "To Delete",
          type: "test",
        }
      );

      // Delete it
      const deleted = await PropertiesMethods.deleteEntityProperty(
        session,
        ruleset.id,
        "feats",
        feat.id,
        created.id
      );

      expect(deleted).toBeDefined();
      expect(deleted.id).toBe(created.id);

      // Verify it's deleted
      const property = await Properties.findOne(db, { id: created.id });
      expect(property).toBeUndefined();
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { feat, session } = await createTestUserAndFeat();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        PropertiesMethods.deleteEntityProperty(
          session,
          fakeRulesetId,
          "feats",
          feat.id,
          "fake-property-id"
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent property", async () => {
      const { ruleset, feat, session } = await createTestUserAndFeat();
      const fakePropertyId = "00000000-0000-0000-0000-000000000000";

      await expect(
        PropertiesMethods.deleteEntityProperty(
          session,
          ruleset.id,
          "feats",
          feat.id,
          fakePropertyId
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when property doesn't belong to entity", async () => {
      const { ruleset, feat, session } = await createTestUserAndFeat();
      const { feat: otherFeat } = await createTestUserAndFeat();

      // Create property for first feat
      const property = await PropertiesMethods.createEntityProperty(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          value: "Test",
          type: "test",
        }
      );

      // Try to delete it as if it belongs to a different feat
      await expect(
        PropertiesMethods.deleteEntityProperty(
          session,
          ruleset.id,
          "feats",
          otherFeat.id,
          property.id
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when property entityType doesn't match", async () => {
      const { ruleset, feat, session } = await createTestUserAndFeat();

      // Create property for feat
      const property = await PropertiesMethods.createEntityProperty(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          value: "Test",
          type: "test",
        }
      );

      // Try to delete it with wrong entityType
      await expect(
        PropertiesMethods.deleteEntityProperty(
          session,
          ruleset.id,
          "items",
          feat.id,
          property.id
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, feat, session } = await createTestUserAndFeat();
      const { session: otherSession } = await createTestUserAndFeat();

      // Create property as owner
      const property = await PropertiesMethods.createEntityProperty(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          value: "Test",
          type: "test",
        }
      );

      // Try to delete as different user
      await expect(
        PropertiesMethods.deleteEntityProperty(
          otherSession,
          ruleset.id,
          "feats",
          feat.id,
          property.id
        )
      ).rejects.toThrow(ForbiddenError);
    });

    test("should cascade delete activities for the property", async () => {
      const { ruleset, feat, session } = await createTestUserAndFeat();

      const property = await PropertiesMethods.createEntityProperty(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          value: "To Delete",
          type: "test",
        }
      );

      // Verify create activity exists
      const activitiesBefore = await Activities.findMany(
        db,
        { userId: session.userId, targetTable: getTableName(propertiesInCustomization) },
        { limit: 100, page: 1 },
      );
      const createActivity = activitiesBefore.items.find(
        (a) => a.targetId === property.id && a.type === "createProperty",
      );
      expect(createActivity).toBeDefined();

      await PropertiesMethods.deleteEntityProperty(session, ruleset.id, "feats", feat.id, property.id);

      // Verify create activity was deleted but delete activity was created
      const activitiesAfter = await Activities.findMany(
        db,
        { userId: session.userId, targetTable: getTableName(propertiesInCustomization) },
        { limit: 100, page: 1 },
      );
      const remaining = activitiesAfter.items.filter((a) => a.targetId === property.id);
      expect(remaining.length).toBe(1);
      expect(remaining[0].type).toBe("deleteProperty");
    });
  });

  describe("template property inheritance", () => {
    // Helper to create a template item with a property and a derived item
    async function createTemplateAndDerivedItem() {
      const uniqueId = Math.random().toString(36).substr(2, 9);

      const users = await Users.create(db, {
        username: `testuser-${uniqueId}`,
        emailAddress: `test-${uniqueId}@example.com`,
        password: "password1234",
      });
      const user = users[0];

      const rulesets = await Rulesets.create(db, {
        name: `Test Ruleset ${uniqueId}`,
        description: "Test ruleset for template property testing",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: user.id,
      });
      const ruleset = rulesets[0];

      // Create template item
      const templates = await Items.create(db, {
        name: `Template ${uniqueId}`,
        description: "A template item",
        rulesetId: ruleset.id,
        isTemplate: true,
        type: "armor",
      });
      const template = templates[0];

      // Create property on the template
      const properties = await Properties.create(db, {
        entityId: template.id,
        entityType: "items",
        type: "AC_BONUS",
        value: "5",
        description: "Armor class bonus",
      });
      const templateProperty = properties[0];

      // Create derived item from template
      const derivedItems = await Items.create(db, {
        name: `Derived ${uniqueId}`,
        description: "An item derived from template",
        rulesetId: ruleset.id,
        sourceItemId: template.id,
        type: "armor",
      });
      const derivedItem = derivedItems[0];

      return {
        user,
        ruleset,
        template,
        templateProperty,
        derivedItem,
        session: createTestSession(user.id),
      };
    }

    test("should update a template property by creating an override on the derived item", async () => {
      const { ruleset, templateProperty, derivedItem, session } =
        await createTemplateAndDerivedItem();

      const result = await PropertiesMethods.updateEntityProperty(
        session,
        ruleset.id,
        "items",
        derivedItem.id,
        templateProperty.id,
        { value: "8", type: "AC_BONUS", description: "Enhanced armor" },
      );

      // Should create a new property (not update the template's)
      expect(result.id).not.toBe(templateProperty.id);
      expect(result.entityId).toBe(derivedItem.id);
      expect(result.value).toBe("8");
      expect(result.type).toBe("AC_BONUS");
      expect(result.description).toBe("Enhanced armor");

      // Template property must be unchanged
      const originalProperty = await Properties.findOne(db, { id: templateProperty.id });
      expect(originalProperty).toBeDefined();
      expect(originalProperty!.value).toBe("5");
      expect(originalProperty!.description).toBe("Armor class bonus");
    });

    test("should update an own property normally even when item has sourceItemId", async () => {
      const { ruleset, derivedItem, session } = await createTemplateAndDerivedItem();

      // Create an own property on the derived item
      const ownProperty = await PropertiesMethods.createEntityProperty(
        session,
        ruleset.id,
        "items",
        derivedItem.id,
        { value: "3", type: "WEIGHT" },
      );

      // Update the own property
      const result = await PropertiesMethods.updateEntityProperty(
        session,
        ruleset.id,
        "items",
        derivedItem.id,
        ownProperty.id,
        { value: "5", type: "WEIGHT" },
      );

      // Should update in-place (same ID)
      expect(result.id).toBe(ownProperty.id);
      expect(result.value).toBe("5");
    });

    test("should throw BadRequestError when deleting a template property from derived item", async () => {
      const { ruleset, templateProperty, derivedItem, session } =
        await createTemplateAndDerivedItem();

      await expect(
        PropertiesMethods.deleteEntityProperty(
          session,
          ruleset.id,
          "items",
          derivedItem.id,
          templateProperty.id,
        ),
      ).rejects.toThrow(BadRequestError);

      // Template property must still exist
      const property = await Properties.findOne(db, { id: templateProperty.id });
      expect(property).toBeDefined();
      expect(property!.value).toBe("5");
    });

    test("should reject update when property belongs to unrelated item (not template)", async () => {
      const { ruleset, session } = await createTemplateAndDerivedItem();
      const uniqueId = Math.random().toString(36).substr(2, 9);

      // Create an unrelated item with a property
      const unrelatedItems = await Items.create(db, {
        name: `Unrelated ${uniqueId}`,
        description: "Unrelated item",
        rulesetId: ruleset.id,
        type: "weapon",
      });
      const unrelatedItem = unrelatedItems[0];

      const unrelatedProps = await Properties.create(db, {
        entityId: unrelatedItem.id,
        entityType: "items",
        type: "DAMAGE",
        value: "1d8",
      });

      // Create another item (not derived from unrelatedItem)
      const otherItems = await Items.create(db, {
        name: `Other ${uniqueId}`,
        description: "Other item",
        rulesetId: ruleset.id,
        type: "weapon",
      });

      // Try to update unrelated item's property through the other item
      await expect(
        PropertiesMethods.updateEntityProperty(
          session,
          ruleset.id,
          "items",
          otherItems[0].id,
          unrelatedProps[0].id,
          { value: "2d6", type: "DAMAGE" },
        ),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
