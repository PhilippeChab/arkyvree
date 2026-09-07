import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { testClient } from "hono/testing";
import { expect, describe, test } from "bun:test";

describe("activities", () => {
  const api = testClient<Application>(application);
  const sessionCookie = "session-id=00000000-0000-4000-8000-000000000123";

  test("should reject unauthenticated requests", async () => {
    const response = await api.api.activities.$get({
      query: {},
    });
    expect(response.status).toBe(401);
  });

  test("should return paginated activities for authenticated user", async () => {
    const response = await api.api.activities.$get(
      { query: {} },
      { headers: { cookie: sessionCookie } },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to get activities: ${error.message}`);
    }

    const result = await response.json();
    expect(result).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.page).toBe(1);
  });

  test("should support pagination parameters", async () => {
    const response = await api.api.activities.$get(
      { query: { limit: "5", page: "1" } },
      { headers: { cookie: sessionCookie } },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to get activities: ${error.message}`);
    }

    const result = await response.json();
    expect(result.items.length).toBeLessThanOrEqual(5);
  });

  test("should support sorting", async () => {
    const response = await api.api.activities.$get(
      { query: { orderBy: "createdAt", orderDir: "asc" } },
      { headers: { cookie: sessionCookie } },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to get activities: ${error.message}`);
    }

    const result = await response.json();
    expect(Array.isArray(result.items)).toBe(true);

    if (result.items.length >= 2) {
      const dates = result.items.map((a) => new Date(a.createdAt).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeGreaterThanOrEqual(dates[i - 1]);
      }
    }
  });

  test("should support type filtering", async () => {
    const response = await api.api.activities.$get(
      { query: { type: "nonExistentType" } },
      { headers: { cookie: sessionCookie } },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to get activities: ${error.message}`);
    }

    const result = await response.json();
    expect(result.items.length).toBe(0);
  });

  test("should support search", async () => {
    const response = await api.api.activities.$get(
      { query: { search: "zzzznonexistent" } },
      { headers: { cookie: sessionCookie } },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to get activities: ${error.message}`);
    }

    const result = await response.json();
    expect(result.items.length).toBe(0);
  });
});
