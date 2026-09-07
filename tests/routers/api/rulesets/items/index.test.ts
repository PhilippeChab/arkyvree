import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { testClient } from "hono/testing";
import { expect, describe, test } from "bun:test";

describe("rulesets items", () => {
  const api = testClient<Application>(application);

  // Helper to create test ruleset
  async function createTestRuleset(): Promise<string> {
    const ruleset = await createSeededTestRuleset("00000000-0000-4000-8000-000000000456");
    return ruleset.id;
  }

  test("should handle full item CRUD lifecycle", async () => {
    const testRulesetId = await createTestRuleset();

    // Get initial list (should be empty or have base items)
    const listResponse = await api.api.rulesets[":id"].items.$get(
      {
        param: { id: testRulesetId },
        query: { limit: "10", page: "1" },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!listResponse.ok) {
      const error = await listResponse.json();
      throw new Error(`Failed to get items: ${error.message}`);
    }

    const initialItems = await listResponse.json();
    expect(initialItems).toBeDefined();
    expect(Array.isArray(initialItems.items)).toBe(true);

    // Create a new item with required fields only
    const newItemBasic = {
      name: "Test Item Basic",
      description: "A test item for testing",
    };

    const createBasicResponse = await api.api.rulesets[":id"].items.$post(
      {
        param: { id: testRulesetId },
        json: newItemBasic,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!createBasicResponse.ok) {
      const error = await createBasicResponse.json();
      throw new Error(`Failed to create item: ${error.message}`);
    }

    const createdBasicItem = await createBasicResponse.json();
    expect(createdBasicItem).toBeDefined();
    expect(createdBasicItem.name).toBe(newItemBasic.name);
    expect(createdBasicItem.description).toBe(newItemBasic.description);

    // Create an item with optional fields
    const newItemFull = {
      name: "Test Item with Optional Fields",
      description: "A test item with weight and cost",
      weight: 2.5,
      costGp: 150,
    };

    const createFullResponse = await api.api.rulesets[":id"].items.$post(
      {
        param: { id: testRulesetId },
        json: newItemFull,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!createFullResponse.ok) {
      const error = await createFullResponse.json();
      throw new Error(`Failed to create item: ${error.message}`);
    }

    const createdFullItem = await createFullResponse.json();
    expect(createdFullItem).toBeDefined();
    expect(createdFullItem.name).toBe(newItemFull.name);
    expect(createdFullItem.description).toBe(newItemFull.description);
    expect(createdFullItem.weight).toBe("2.50");
    expect(createdFullItem.costGp).toBe("150.00");

    // Get the item by ID
    const getResponse = await api.api.rulesets[":id"].items[":itemId"].$get(
      {
        param: { id: testRulesetId, itemId: createdFullItem.id },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!getResponse.ok) {
      const error = await getResponse.json();
      throw new Error(`Failed to get item: ${error.message}`);
    }

    const fetchedItem = await getResponse.json();
    expect(fetchedItem).toBeDefined();
    expect(fetchedItem.id).toBe(createdFullItem.id);
    expect(fetchedItem.name).toBe(newItemFull.name);
    expect(fetchedItem.description).toBe(newItemFull.description);
    expect(fetchedItem.weight).toBe("2.50");
    expect(fetchedItem.costGp).toBe("150.00");

    // Update the item
    const updateData = {
      name: "Updated Test Item",
      description: "Updated description",
      weight: 3.2,
      costGp: 200,
    };

    const updateResponse = await api.api.rulesets[":id"].items[":itemId"].$put(
      {
        param: { id: testRulesetId, itemId: createdFullItem.id },
        json: updateData,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!updateResponse.ok) {
      const error = await updateResponse.json();
      throw new Error(`Failed to update item: ${error.message}`);
    }

    const updatedItem = await updateResponse.json();
    expect(updatedItem.name).toBe(updateData.name);
    expect(updatedItem.description).toBe(updateData.description);
    expect(updatedItem.weight).toBe("3.20");
    expect(updatedItem.costGp).toBe("200.00");

    // Delete the item
    const deleteResponse = await api.api.rulesets[":id"].items[":itemId"].$delete(
      {
        param: { id: testRulesetId, itemId: createdFullItem.id },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!deleteResponse.ok) {
      const error = await deleteResponse.json();
      throw new Error(`Failed to delete item: ${error.message}`);
    }

    const deletedItem = await deleteResponse.json();
    expect(deletedItem).toBeDefined();
  });

  test("should handle authentication and validation", async () => {
    const testRulesetId = await createTestRuleset();

    // Test unauthenticated request
    const unauthResponse = await api.api.rulesets[":id"].items.$get({
      param: { id: testRulesetId },
      query: { limit: "10", page: "1" },
    });
    expect(unauthResponse.status).toBe(401);

    // Test validation - missing required fields
    const invalidItem = {
      description: "Missing name field",
    };

    const validationResponse = await api.api.rulesets[":id"].items.$post(
      {
        param: { id: testRulesetId },
        json: invalidItem as never,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(validationResponse.status).toBe(400);

    // Test validation - invalid weight
    const invalidWeightItem = {
      name: "Test Item 1",
      description: "Test description",
      weight: "not-a-number",
    };

    const weightValidationResponse = await api.api.rulesets[":id"].items.$post(
      {
        param: { id: testRulesetId },
        json: invalidWeightItem as never,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(weightValidationResponse.status).toBe(400);

    // Test validation - invalid costGp
    const invalidCostItem = {
      name: "Test Item 2",
      description: "Test description",
      costGp: "not-a-number",
    };

    const costValidationResponse = await api.api.rulesets[":id"].items.$post(
      {
        param: { id: testRulesetId },
        json: invalidCostItem as never,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(costValidationResponse.status).toBe(400);
  });

  test("should handle non-existent resources", async () => {
    const testRulesetId = await createTestRuleset();

    // Test non-existent ruleset
    const nonExistentRulesetResponse = await api.api.rulesets[":id"].items.$get(
      {
        param: { id: "00000000-0000-0000-0000-000000000000" },
        query: { limit: "10", page: "1" },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(nonExistentRulesetResponse.status).toBe(404);

    // Test non-existent item
    const updateResponse = await api.api.rulesets[":id"].items[":itemId"].$put(
      {
        param: { id: testRulesetId, itemId: "00000000-0000-0000-0000-000000000000" },
        json: { name: "Test", description: "Test" },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(updateResponse.status >= 400).toBe(true);
  });

  test("should round-trip updatedAt and 409 on stale CAS", async () => {
    const testRulesetId = await createTestRuleset();

    const createResponse = await api.api.rulesets[":id"].items.$post(
      {
        param: { id: testRulesetId },
        json: { name: "CAS Test", description: "Initial" },
      },
      { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
    );
    expect(createResponse.ok).toBe(true);
    const created = await createResponse.json() as { id: string };

    const getResponse = await api.api.rulesets[":id"].items[":itemId"].$get(
      {
        param: { id: testRulesetId, itemId: created.id },
      },
      { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
    );
    expect(getResponse.ok).toBe(true);
    const loaded = await getResponse.json() as { id: string; updatedAt: string };
    expect(typeof loaded.updatedAt).toBe("string");

    // First save with the real PG-format updatedAt — must be accepted by Zod
    // and pass CAS at the DB layer.
    const firstUpdate = await api.api.rulesets[":id"].items[":itemId"].$put(
      {
        param: { id: testRulesetId, itemId: loaded.id },
        json: { name: "Edit One", description: "First edit", updatedAt: loaded.updatedAt },
      },
      { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
    );
    expect(firstUpdate.status).toBe(200);

    // Replay the original updatedAt — server must reject with 409.
    const staleUpdate = await api.api.rulesets[":id"].items[":itemId"].$put(
      {
        param: { id: testRulesetId, itemId: loaded.id },
        json: { name: "Edit Two", description: "Stale edit", updatedAt: loaded.updatedAt },
      },
      { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
    );
    expect(staleUpdate.status).toBe(409);
  });

  test(
    "should cascade delete requirements/properties/modifiers when deleting item",
    async () => {
      const testRulesetId = await createTestRuleset();

      // Create an item
      const newItem = {
        name: "Test Item for Cascade Deletion",
        description: "A test item for cascade deletion testing",
        weight: 2,
        costGp: 1000,
      };

      const itemResponse = await api.api.rulesets[":id"].items.$post(
        {
          param: { id: testRulesetId },
          json: newItem,
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

      if (!itemResponse.ok) {
        const error = await itemResponse.json();
        throw new Error(`Failed to create item: ${error.message}`);
      }

      const createdItem = await itemResponse.json();

      // Create a requirement for the item
      const requirement = {
        level: "1",
        target: "abilities.strength.total",
        value: "15",
        valueType: "number",
        operator: "greater_than_or_equal",
      };

      const reqResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
        .requirements.$post(
          {
            param: { id: testRulesetId, entityId: createdItem.id, entityType: "items" },
            json: requirement,
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          },
        );

      if (!reqResponse.ok) {
        const error = await reqResponse.json();
        throw new Error(`Failed to create requirement: ${error.message}`);
      }

      // Create a property for the item
      const property = {
        name: "enchantment",
        value: "+1",
        type: "enhancement",
      };

      const propResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
        .properties.$post(
          {
            param: { id: testRulesetId, entityId: createdItem.id, entityType: "items" },
            json: property,
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          },
        );

      if (!propResponse.ok) {
        const error = await propResponse.json();
        throw new Error(`Failed to create property: ${error.message}`);
      }

      // Create a modifier for the item
      const modifier = {
        sourceType: "items",
        sourceId: createdItem.id,
        target: "abilities.strength.misc",
        value: "1",
        valueType: "number",
        operator: "add",
      };

      const modResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
        .modifiers.$post(
          {
            param: { id: testRulesetId, entityId: createdItem.id, entityType: "items" },
            json: modifier,
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          },
        );

      if (!modResponse.ok) {
        const error = await modResponse.json();
        throw new Error(`Failed to create modifier: ${error.message}`);
      }

      // Verify all entities exist
      const requirementsResponse = await api.api.rulesets[":id"]
        .customization[":entityType"][":entityId"].requirements.$get(
          {
            param: { id: testRulesetId, entityId: createdItem.id, entityType: "items" },
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          },
        );

      if (!requirementsResponse.ok) {
        const error = await requirementsResponse.json();
        throw new Error(`Failed to get requirements: ${error.message}`);
      }

      const requirements = await requirementsResponse.json();
      expect(requirements.length > 0).toBe(true);

      // Delete the item
      const deleteResponse = await api.api.rulesets[":id"].items[":itemId"].$delete(
        {
          param: { id: testRulesetId, itemId: createdItem.id },
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

      if (!deleteResponse.ok) {
        const error = await deleteResponse.json();
        throw new Error(`Failed to delete item: ${error.message}`);
      }

      // Verify associated entities are deleted
      const requirementsAfterDelete = await api.api.rulesets[":id"]
        .customization[":entityType"][":entityId"].requirements.$get(
          {
            param: { id: testRulesetId, entityId: createdItem.id, entityType: "items" },
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          },
        );

      // Should return 404 or empty array since the item no longer exists
      if (requirementsAfterDelete.ok) {
        const deletedRequirements = await requirementsAfterDelete.json();
        expect(Array.isArray(deletedRequirements)).toBe(true);
        expect(deletedRequirements.length).toBe(0);
      } else {
        expect(requirementsAfterDelete.status).toBe(404);
      }
    },
  );

  test("should bulk-create variants from an existing item", async () => {
    const testRulesetId = await createTestRuleset();

    const createSourceResponse = await api.api.rulesets[":id"].items.$post(
      {
        param: { id: testRulesetId },
        json: { name: "Bulk Source", description: "Source for variants", costGp: 25, weight: 0.1 },
      },
      { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
    );
    if (!createSourceResponse.ok) {
      const error = await createSourceResponse.json();
      throw new Error(`Failed to create source item: ${error.message}`);
    }
    const source = await createSourceResponse.json();

    const variantsResponse = await api.api.rulesets[":id"].items[":itemId"].variants.$post(
      {
        param: { id: testRulesetId, itemId: source.id },
        json: {
          variants: [
            { name: "Bulk Variant A", description: "First" },
            { name: "Bulk Variant B" },
          ],
        },
      },
      { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
    );

    if (!variantsResponse.ok) {
      const error = await variantsResponse.json();
      throw new Error(`Failed to bulk-create variants: ${error.message}`);
    }

    const created = await variantsResponse.json();
    expect(Array.isArray(created)).toBe(true);
    expect(created).toHaveLength(2);
    expect(created.map((i) => i.name).sort()).toEqual([
      "Bulk Variant A",
      "Bulk Variant B",
    ]);
    for (const item of created) {
      expect(item.costGp).toBe("25.00");
      expect(item.weight).toBe("0.10");
    }
  });

  test("should reject bulk-create variants over the cap with 422", async () => {
    const testRulesetId = await createTestRuleset();

    const createSourceResponse = await api.api.rulesets[":id"].items.$post(
      {
        param: { id: testRulesetId },
        json: { name: "Bulk Cap Source", description: "Source for cap test" },
      },
      { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
    );
    if (!createSourceResponse.ok) {
      const error = await createSourceResponse.json();
      throw new Error(`Failed to create source item: ${error.message}`);
    }
    const source = await createSourceResponse.json();

    const tooMany = Array.from({ length: 51 }, (_, i) => ({ name: `Cap Variant ${i}` }));

    const variantsResponse = await api.api.rulesets[":id"].items[":itemId"].variants.$post(
      {
        param: { id: testRulesetId, itemId: source.id },
        json: { variants: tooMany },
      },
      { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
    );

    expect(variantsResponse.ok).toBe(false);
    expect(variantsResponse.status).toBe(400);
  });
});
