import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { testClient } from "hono/testing";
import { expect, describe, test } from "bun:test";

describe("dashboard", () => {
  const api = testClient<Application>(application);

  test("should get stats for authenticated user", async () => {
    // Test dashboard stats endpoint with Bjorn's session
    const statsResponse = await api.api.dashboard.stats.$get({
      header: {
        cookie: "session-id=00000000-0000-4000-8000-000000000123",
      },
    });

    if (!statsResponse.ok) {
      const error = await statsResponse.json();
      throw new Error(error.message);
    }

    const stats = await statsResponse.json();
    expect(stats).toBeDefined();
    // Add more specific assertions based on your stats structure
  });

  test("should reject unauthenticated requests", async () => {
    const statsResponse = await api.api.dashboard.stats.$get();
    expect(statsResponse.status).toBe(401);
  });
});
