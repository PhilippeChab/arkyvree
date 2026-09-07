import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { describe, expect, test } from "bun:test";
import { testClient } from "hono/testing";

describe("rulesets customization property types", () => {
  const api = testClient<Application>(application);

  async function createTestRuleset(): Promise<string> {
    const ruleset = await createSeededTestRuleset("00000000-0000-4000-8000-000000000456");
    return ruleset.id;
  }

  test(
      "GET /api/rulesets/:id/customization/properties/types should get all property types",
      async () => {
        const testRulesetId = await createTestRuleset();
        const response = await api.api.rulesets[":id"].customization.properties.types.$get(
          {
            param: { id: testRulesetId },
            query: {},
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(`Failed to get property types: ${error.message}`);
        }

        const propertyTypes = await response.json();
        expect(propertyTypes).toBeDefined();
        expect(Array.isArray(propertyTypes)).toBe(true);

        // Should include static property types
        const staticTypes = propertyTypes.filter((type) => type.isStatic === true);
        expect(staticTypes.length > 0).toBe(true);

        if (propertyTypes.length > 0) {
          const firstType = propertyTypes[0];
          expect(firstType.value).toBeDefined();
          expect(firstType.isStatic).toBeDefined();
          expect(typeof firstType.isStatic).toBe("boolean");
        }
      });

  test(
      "GET /api/rulesets/:id/customization/properties/types should filter by entity type",
      async () => {
        const testRulesetId = await createTestRuleset();
        const response = await api.api.rulesets[":id"].customization.properties.types.$get(
          {
            param: { id: testRulesetId },
            query: { entityType: "items" },
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(`Failed to get property types for items: ${error.message}`);
        }

        const propertyTypes = await response.json();
        expect(propertyTypes).toBeDefined();
        expect(Array.isArray(propertyTypes)).toBe(true);

        // Should still include static types (they don't have entityType)
        const staticTypes = propertyTypes.filter((type) => type.isStatic === true);
        expect(staticTypes.length > 0).toBe(true);
      });

  test(
      "GET /api/rulesets/:id/customization/properties/types should reject invalid entity type",
      async () => {
        const testRulesetId = await createTestRuleset();
        const response = await api.api.rulesets[":id"].customization.properties.types.$get(
          {
            param: { id: testRulesetId },
            query: { entityType: "invalid" as never },
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          });

        expect(response.status).toBe(400);
      });

  test(
      "GET /api/rulesets/:id/customization/properties/types should require authentication",
      async () => {
        const testRulesetId = await createTestRuleset();
        const response = await api.api.rulesets[":id"].customization.properties.types.$get({
          param: { id: testRulesetId },
          query: {},
        });

        expect(response.status).toBe(401);
      });

  test(
      "GET /api/rulesets/:id/customization/properties/types/search should search property types",
      async () => {
        const testRulesetId = await createTestRuleset();
        const response = await api.api.rulesets[":id"].customization.properties.types.search.$get(
          {
            param: { id: testRulesetId },
            query: { query: "weapon" },
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(`Failed to search property types: ${error.message}`);
        }

        const searchResults = await response.json();
        expect(searchResults).toBeDefined();
        expect(Array.isArray(searchResults)).toBe(true);

        // Should find WEAPON_PROFICIENCY static property
        const weaponTypes = searchResults.filter((type) =>
          type.value.toLowerCase().includes("weapon") && type.isStatic === true
        );
        expect(weaponTypes.length > 0).toBe(true);
      });

  test(
      "GET /api/rulesets/:id/customization/properties/types/search should filter by entity type",
      async () => {
        const testRulesetId = await createTestRuleset();
        const response = await api.api.rulesets[":id"].customization.properties.types.search.$get(
          {
            param: { id: testRulesetId },
            query: { query: "type", entityType: "items" },
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(`Failed to search property types for items: ${error.message}`);
        }

        const searchResults = await response.json();
        expect(searchResults).toBeDefined();
        expect(Array.isArray(searchResults)).toBe(true);
      });

  test(
      "GET /api/rulesets/:id/customization/properties/types/search should require query parameter",
      async () => {
        const testRulesetId = await createTestRuleset();
        const response = await api.api.rulesets[":id"].customization.properties.types.search.$get(
          {
            param: { id: testRulesetId },
            query: { query: "" },
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          });

        expect(response.status).toBe(400);
      });

  test(
      "GET /api/rulesets/:id/customization/properties/types/completions should get property type completions",
      async () => {
        const testRulesetId = await createTestRuleset();
        const response = await api.api.rulesets[":id"].customization.properties.types.completions
          .$get(
            {
              param: { id: testRulesetId },
              query: { query: "weapon" },
            },
            {
              headers: {
                cookie: "session-id=00000000-0000-4000-8000-000000000123",
              },
            });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(`Failed to get property type completions: ${error.message}`);
        }

        const result = await response.json();
        expect(result).toBeDefined();
        if ("error" in result) throw new Error("Expected paginated result");
        expect(Array.isArray(result.items)).toBe(true);

        if (result.items.length > 0) {
          const completion = result.items[0];
          expect(completion.label).toBeDefined();
          expect(completion.value).toBeDefined();
          expect(completion.kind).toBeDefined();
          expect(typeof completion.kind).toBe("string");
          expect(["engine", "custom"].includes(completion.kind)).toBe(true);
        }
      });

  test(
      "GET /api/rulesets/:id/customization/properties/types/completions should work with empty query",
      async () => {
        const testRulesetId = await createTestRuleset();
        const response = await api.api.rulesets[":id"].customization.properties.types.completions
          .$get(
            {
              param: { id: testRulesetId },
              query: { query: "" },
            },
            {
              headers: {
                cookie: "session-id=00000000-0000-4000-8000-000000000123",
              },
            });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(`Failed to get completions with empty query: ${error.message}`);
        }

        const result = await response.json();
        expect(result).toBeDefined();
        if ("error" in result) throw new Error("Expected paginated result");
        expect(Array.isArray(result.items)).toBe(true);

        // Should return all static property types
        const staticCompletions = result.items.filter((completion) => completion.kind === "engine");
        expect(staticCompletions.length > 0).toBe(true);
      });

  test(
      "GET /api/rulesets/:id/customization/properties/types/completions should filter by entity type",
      async () => {
        const testRulesetId = await createTestRuleset();
        const response = await api.api.rulesets[":id"].customization.properties.types.completions
          .$get(
            {
              param: { id: testRulesetId },
              query: { query: "armor", entityType: "items" },
            },
            {
              headers: {
                cookie: "session-id=00000000-0000-4000-8000-000000000123",
              },
            });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(`Failed to get completions for items: ${error.message}`);
        }

        const result = await response.json();
        expect(result).toBeDefined();
        if ("error" in result) throw new Error("Expected paginated result");
        expect(Array.isArray(result.items)).toBe(true);

        // Should find ARMOR_TYPE static property
        const armorCompletions = result.items.filter((completion) =>
          completion.value.toLowerCase().includes("armor") && completion.kind === "engine"
        );
        expect(armorCompletions.length > 0).toBe(true);
      });

  test("should handle non-existent ruleset", async () => {
      const response = await api.api.rulesets[":id"].customization.properties.types.$get(
        {
          param: { id: "00000000-0000-0000-0000-000000000000" },
          query: {},
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        });

      // Now that property types are resolved via factory, non-existent rulesets return 500
      expect(response.status).toBe(500);
    });

  test("should validate query parameters", async () => {
      const testRulesetId = await createTestRuleset();
      // Test search endpoint with missing query
      const searchResponse = await api.api.rulesets[":id"].customization.properties.types.search
        .$get(
          {
            param: { id: testRulesetId },
            query: {} as never,
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          });

      expect(searchResponse.status).toBe(400);
    });

  test("should handle different static property types", async () => {
      const testRulesetId = await createTestRuleset();
      const response = await api.api.rulesets[":id"].customization.properties.types.$get(
        {
          param: { id: testRulesetId },
          query: {},
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        });

      if (!response.ok) {
        throw new Error("Failed to get property types");
      }

      const propertyTypes = await response.json();
      const staticTypes = propertyTypes.filter((type) => type.isStatic === true);

      // Verify we have expected static property types
      const expectedTypes = [
        "WEAPON_PROFICIENCY",
        "WEAPON_BASE_DAMAGE",
        "WEAPON_CRITICAL_RANGE",
        "WEAPON_CRITICAL_MULTIPLIER",
        "ARMOR_PROFICIENCY",
        "ARMOR_MAX_DEX",
        "SHIELD_PROFICIENCY",
        "DAMAGE_TYPE",
        "ITEM_MADE_OF",
      ];

      for (const expectedType of expectedTypes) {
        const found = staticTypes.some((type) => type.value === expectedType);
        expect(found).toBe(true);
      }

      // Verify static types have descriptions
      for (const type of staticTypes) {
        expect(type.description, `Static type ${type.value} should have a description`).toBeDefined();
        expect(typeof type.description).toBe("string");
      }
    });

  // --- Property Value Completions ---

  test(
    "GET /values/completions should return engine values for a known type",
    async () => {
      const testRulesetId = await createTestRuleset();
      const response = await api.api.rulesets[":id"].customization.properties.values.completions
        .$get(
          {
            param: { id: testRulesetId },
            query: { type: "WEAPON_PROFICIENCY", query: "" },
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          });

      expect(response.status).toBe(200);
      const result = await response.json();
      if ("error" in result) throw new Error("Expected paginated result");
      expect(Array.isArray(result.items)).toBe(true);

      const labels = result.items.map((c) => c.value);
      expect(labels).toContain("Simple");
      expect(labels).toContain("Martial");
      expect(labels).toContain("Exotic");

      for (const c of result.items) {
        expect(c.kind).toBe("engine");
      }
    });

  test(
    "GET /values/completions should filter engine values by query",
    async () => {
      const testRulesetId = await createTestRuleset();
      const response = await api.api.rulesets[":id"].customization.properties.values.completions
        .$get(
          {
            param: { id: testRulesetId },
            query: { type: "WEAPON_PROFICIENCY", query: "Mar" },
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          });

      expect(response.status).toBe(200);
      const result = await response.json();
      if ("error" in result) throw new Error("Expected paginated result");
      expect(result.items.length).toBe(1);
      expect(result.items[0].value).toBe("Martial");
    });

  test(
    "GET /values/completions should return empty for unknown type with no values",
    async () => {
      const testRulesetId = await createTestRuleset();
      const response = await api.api.rulesets[":id"].customization.properties.values.completions
        .$get(
          {
            param: { id: testRulesetId },
            query: { type: "NONEXISTENT_TYPE", query: "" },
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          });

      expect(response.status).toBe(200);
      const result = await response.json();
      if ("error" in result) throw new Error("Expected paginated result");
      expect(result.items.length).toBe(0);
    });

  test(
    "GET /values/completions should require type parameter",
    async () => {
      const testRulesetId = await createTestRuleset();
      const response = await api.api.rulesets[":id"].customization.properties.values.completions
        .$get(
          {
            param: { id: testRulesetId },
            query: { type: "", query: "" },
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          });

      expect(response.status).toBe(400);
    });

  test("should distinguish between static and custom completions", async () => {
      const testRulesetId = await createTestRuleset();
      const response = await api.api.rulesets[":id"].customization.properties.types.completions
        .$get(
          {
            param: { id: testRulesetId },
            query: { query: "" },
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          });

      if (!response.ok) {
        throw new Error("Failed to get completions");
      }

      const result = await response.json();
      if ("error" in result) throw new Error("Expected paginated result");
      const staticCompletions = result.items.filter((completion) => completion.kind === "engine");
      const customCompletions = result.items.filter((completion) => completion.kind === "custom");

      // Should have static completions
      expect(staticCompletions.length > 0).toBe(true);

      // Static completions should have descriptions as detail
      for (const completion of staticCompletions) {
        expect(completion.detail).toBeDefined();
        expect(typeof completion.detail).toBe("string");
      }

      // Custom completions (if any) should have usage information as detail
      for (const completion of customCompletions) {
        if (completion.detail) {
          expect(completion.detail.includes("time")).toBe(true);
        }
      }
    });
  });
