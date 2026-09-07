import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { testClient } from "hono/testing";
import { expect, describe, test } from "bun:test";

describe("rulesets customization target paths", () => {
  const api = testClient<Application>(application);

  async function createTestRuleset(): Promise<string> {
    const ruleset = await createSeededTestRuleset("00000000-0000-4000-8000-000000000456");
    return ruleset.id;
  }

  test(
      "POST /api/rulesets/:id/customization/target/paths/completions should get completions",
      async () => {
        const response = await api.api.rulesets[":id"].customization.target.paths.completions.$post(
          {
            param: { id: await createTestRuleset() },
            json: {
              partialPath: "",
              position: 0,
              kind: "modifier",
            },
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(`Failed to get completions: ${error.message}`);
        }

        const result = await response.json();
        expect(result).toBeDefined();
        expect(result.items).toBeDefined();
        expect(Array.isArray(result.items)).toBe(true);
        expect(result.segmentLabels).toBeDefined();

        if (result.items.length > 0) {
          const completion = result.items[0];
          expect(completion.label).toBeDefined();
          expect(completion.detail).toBeDefined();
          expect(completion.insertText).toBeDefined();
          expect(completion.kind).toBe("category");
        }
      });

  test(
      "POST /api/rulesets/:id/customization/target/paths/completions should return leaf path info",
      async () => {
        const response = await api.api.rulesets[":id"].customization.target.paths.completions.$post(
          {
            param: { id: await createTestRuleset() },
            json: {
              partialPath: "abilities.strength.",
              position: "abilities.strength.".length,
              kind: "modifier",
            },
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(`Failed to get leaf completions: ${error.message}`);
        }

        const result = await response.json();
        expect(result.items.length).toBeGreaterThan(0);

        const leafItem = result.items.find((item: { kind: string }) => item.kind === "property");
        if (leafItem) {
          expect(leafItem.path).toBeDefined();
          expect(leafItem.valueType).toBeDefined();
          expect(leafItem.operators).toBeDefined();
          expect(Array.isArray(leafItem.operators)).toBe(true);
        }
      });

  test(
      "POST /api/rulesets/:id/customization/target/paths/completions should paginate",
      async () => {
        const response = await api.api.rulesets[":id"].customization.target.paths.completions.$post(
          {
            param: { id: await createTestRuleset() },
            json: {
              partialPath: "",
              position: 0,
              kind: "modifier",
              limit: 2,
              page: 1,
            },
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(`Failed to get paginated completions: ${error.message}`);
        }

        const result = await response.json();
        expect(result.items.length).toBeLessThanOrEqual(2);
      });

  test(
      "POST /api/rulesets/:id/customization/target/paths/completions should require authentication",
      async () => {
        const response = await api.api.rulesets[":id"].customization.target.paths.completions.$post({
          param: { id: await createTestRuleset() },
          json: {
            partialPath: "",
            position: 0,
            kind: "modifier",
          },
        });

        expect(response.status).toBe(401);
      });

  test(
      "POST /api/rulesets/:id/customization/target/paths/validate should validate valid path",
      async () => {
        const testRulesetId = await createTestRuleset();

        // Get a valid path from completions
        const completionsResponse = await api.api.rulesets[":id"].customization.target.paths.completions.$post(
          {
            param: { id: testRulesetId },
            json: {
              partialPath: "abilities.strength.",
              position: "abilities.strength.".length,
              kind: "modifier",
            },
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          });

        if (!completionsResponse.ok) {
          throw new Error("Failed to get completions for validation testing");
        }

        const completions = await completionsResponse.json();
        const leafItem = completions.items.find((item: { path?: string }) => item.path);

        if (leafItem && leafItem.path) {
          const response = await api.api.rulesets[":id"].customization.target.paths.validate.$post(
            {
              param: { id: testRulesetId },
              json: {
                path: leafItem.path,
                kind: "modifier",
              },
            },
            {
              headers: {
                cookie: "session-id=00000000-0000-4000-8000-000000000123",
              },
            });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(`Failed to validate path: ${error.message}`);
          }

          const validation = await response.json();
          expect(validation.isValid).toBe(true);
        }
      });

  test(
      "POST /api/rulesets/:id/customization/target/paths/validate should reject invalid path",
      async () => {
        const response = await api.api.rulesets[":id"].customization.target.paths.validate.$post(
          {
            param: { id: await createTestRuleset() },
            json: {
              path: "invalid.nonexistent.path",
              kind: "modifier",
            },
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(`Failed to validate invalid path: ${error.message}`);
        }

        const validation = await response.json();
        expect(validation.isValid).toBe(false);
        expect(validation.errors.length > 0).toBe(true);
      });

  test(
      "POST /api/rulesets/:id/customization/target/paths/completions should reject invalid kind",
      async () => {
        const response = await api.api.rulesets[":id"].customization.target.paths.completions.$post(
          {
            param: { id: await createTestRuleset() },
            json: {
              partialPath: "",
              position: 0,
              kind: "invalid" as never,
            },
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          });

        expect(response.status).toBe(400);
      });

  test(
      "POST /api/rulesets/:id/customization/target/paths/completions should reject missing fields",
      async () => {
        const response = await api.api.rulesets[":id"].customization.target.paths.completions.$post(
          {
            param: { id: await createTestRuleset() },
            json: {
              partialPath: "test",
            } as never,
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          });

        expect(response.status).toBe(400);
      });

  test(
      "POST /api/rulesets/:id/customization/target/paths/validate should reject empty path as invalid category",
      async () => {
        const response = await api.api.rulesets[":id"].customization.target.paths.validate.$post(
          {
            param: { id: await createTestRuleset() },
            json: {
              path: "",
              kind: "modifier",
            },
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(`Failed to validate empty path: ${error.message}`);
        }

        const validation = await response.json();
        expect(validation.isValid).toBe(false);
        expect(validation.errors[0].code).toBe("INVALID_CATEGORY");
      });

  test("should validate request body schemas", async () => {
      const validateResponse = await api.api.rulesets[":id"].customization.target.paths.validate
        .$post(
          {
            param: { id: await createTestRuleset() },
            json: {
              // Missing required fields
            } as never,
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          });

      expect(validateResponse.status).toBe(400);
    });
  });
