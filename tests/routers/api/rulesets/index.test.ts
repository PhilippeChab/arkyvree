import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { testClient } from "hono/testing";
import { expect, describe, test } from "bun:test";

describe("rulesets", () => {
  const api = testClient<Application>(application);

  test("should get list of rulesets for authenticated user", async () => {
    const response = await api.api.rulesets.$get(
      {
        query: {},
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123", // Bjorn's session
        },
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to get rulesets: ${error.message}`);
    }

    const rulesets = await response.json();
    expect(rulesets).toBeDefined();
    expect(rulesets.items).toBeDefined();
    expect(Array.isArray(rulesets.items)).toBe(true);
  });

  test("should get specific ruleset details", async () => {
    // First get the list to get a ruleset ID
    const listResponse = await api.api.rulesets.$get(
      {
        query: {},
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!listResponse.ok) {
      const error = await listResponse.json();
      throw new Error(`Failed to get rulesets: ${error.message}`);
    }

    const rulesets = await listResponse.json();

    expect(rulesets.items.length).toBeGreaterThan(0);

    const rulesetId = rulesets.items[0].id;

    // Then get the specific ruleset
    const response = await api.api.rulesets[":id"].$get(
      {
        param: { id: rulesetId },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to get ruleset: ${error.message}`);
    }

    const ruleset = await response.json();
    expect(ruleset).toBeDefined();
    expect(ruleset.id).toBe(rulesetId);
    expect(ruleset.name).toBeDefined();
  });

  test("should update a ruleset", async () => {
    const createdRuleset = await createSeededTestRuleset("00000000-0000-4000-8000-000000000456");

    // Now update it
    const updateData = {
      name: "Updated Test Ruleset",
      description: "Updated description",
      private: false,
    };

    const updateResponse = await api.api.rulesets[":id"].$put(
      {
        param: { id: createdRuleset.id },
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
      throw new Error(`Failed to update ruleset: ${error.message}`);
    }

    const updatedRuleset = await updateResponse.json();
    expect(updatedRuleset.name).toBe(updateData.name);
    expect(updatedRuleset.description).toBe(updateData.description);
    expect(updatedRuleset.private).toBe(updateData.private);
  });

  test("should reject unauthenticated list requests", async () => {
    const response = await api.api.rulesets.$get({ query: {} });
    expect(response.status).toBe(401);
  });

  test("should reject unauthenticated detail requests", async () => {
    const response = await api.api.rulesets[":id"].$get({
      param: { id: "00000000-0000-0000-0000-000000000000" },
    });
    expect(response.status).toBe(401);
  });

  test("should handle non-existent ruleset", async () => {
    const response = await api.api.rulesets[":id"].$get(
      {
        param: { id: "00000000-0000-0000-0000-000000000000" },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(response.status).toBe(404);
  });

  test("should star a ruleset", async () => {
    const createdRuleset = await createSeededTestRuleset("00000000-0000-4000-8000-000000000456", {
      name: "Ruleset To Star",
      private: false,
    });

    // Publish as an extension so it's eligible for starring (fork inherits
    // minimum content from parent).
    await api.api.rulesets[":id"].publish.$post(
      { param: { id: createdRuleset.id }, json: { kind: "extension" } },
      { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
    );

    // Star the ruleset
    const starResponse = await api.api.rulesets[":id"].star.$post(
      {
        param: { id: createdRuleset.id },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(starResponse.status).toBe(201);

    // Verify it shows as starred in detail
    const detailResponse = await api.api.rulesets[":id"].$get(
      {
        param: { id: createdRuleset.id },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!detailResponse.ok) {
      const error = await detailResponse.json();
      throw new Error(`Failed to get ruleset: ${error.message}`);
    }

    const ruleset = await detailResponse.json();
    expect(ruleset.isStarred).toBe(true);
  });

  test("should unstar a ruleset", async () => {
    const createdRuleset = await createSeededTestRuleset("00000000-0000-4000-8000-000000000456", {
      name: "Ruleset To Unstar",
      private: false,
    });

    await api.api.rulesets[":id"].publish.$post(
      { param: { id: createdRuleset.id }, json: { kind: "extension" } },
      { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
    );

    await api.api.rulesets[":id"].star.$post(
      {
        param: { id: createdRuleset.id },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    // Unstar the ruleset
    const unstarResponse = await api.api.rulesets[":id"].star.$delete(
      {
        param: { id: createdRuleset.id },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(unstarResponse.status).toBe(200);

    // Verify it shows as not starred
    const detailResponse = await api.api.rulesets[":id"].$get(
      {
        param: { id: createdRuleset.id },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!detailResponse.ok) {
      const error = await detailResponse.json();
      throw new Error(`Failed to get ruleset: ${error.message}`);
    }

    const ruleset = await detailResponse.json();
    expect(ruleset.isStarred).toBe(false);
  });

  test("should return 404 when starring non-existent ruleset", async () => {
    const response = await api.api.rulesets[":id"].star.$post(
      {
        param: { id: "00000000-0000-0000-0000-000000000000" },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(response.status).toBe(404);
  });

  test("should return 403 when starring a draft ruleset", async () => {
    const createdRuleset = await createSeededTestRuleset("00000000-0000-4000-8000-000000000456", {
      name: "Draft Ruleset Star Test",
      private: false,
    });

    const response = await api.api.rulesets[":id"].star.$post(
      {
        param: { id: createdRuleset.id },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(response.status).toBe(403);
  });

  test("should filter by starred scope", async () => {
    const createdRuleset = await createSeededTestRuleset("00000000-0000-4000-8000-000000000456", {
      name: "Starred Scope Test",
      private: false,
    });

    await api.api.rulesets[":id"].publish.$post(
      { param: { id: createdRuleset.id }, json: { kind: "extension" } },
      { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
    );

    await api.api.rulesets[":id"].star.$post(
      {
        param: { id: createdRuleset.id },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    // Get starred rulesets
    const listResponse = await api.api.rulesets.$get(
      {
        query: { scope: "starred" },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!listResponse.ok) {
      const error = await listResponse.json();
      throw new Error(`Failed to get rulesets: ${error.message}`);
    }

    const rulesets = await listResponse.json();
    expect(rulesets.items.length).toBeGreaterThanOrEqual(1);

    const found = rulesets.items.find((r: { id: string }) => r.id === createdRuleset.id);
    expect(found).toBeDefined();
  });

});
