import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { testClient } from "hono/testing";
import { describe, expect, test } from "bun:test";

describe("notifications router", () => {
  const api = testClient<Application>(application);
  const sessionCookie = "session-id=00000000-0000-4000-8000-000000000123";

  test("should reject unauthenticated requests", async () => {
    const response = await api.api.notifications.$get({ query: {} });
    expect(response.status).toBe(401);
  });

  test("should return paginated notifications", async () => {
    const response = await api.api.notifications.$get(
      { query: {} },
      { headers: { cookie: sessionCookie } },
    );
    expect(response.ok).toBe(true);
    const result = await response.json() as { items: unknown[]; page: number };
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.page).toBe(1);
  });

  test("should return unread count", async () => {
    const response = await api.api.notifications.unread.$get(
      {},
      { headers: { cookie: sessionCookie } },
    );
    expect(response.ok).toBe(true);
    const result = await response.json() as { count: number };
    expect(typeof result.count).toBe("number");
  });

  test("should return 404 for nonexistent notification mark-read", async () => {
    const response = await api.api.notifications[":id"].read.$post(
      { param: { id: "00000000-0000-0000-0000-000000000000" } },
      { headers: { cookie: sessionCookie } },
    );
    expect(response.status).toBe(404);
  });

  test("should mark all notifications as read", async () => {
    const response = await (api.api.notifications as unknown as { "read-all": { $post: (body: unknown, opts: unknown) => Promise<Response> } })["read-all"].$post(
      {},
      { headers: { cookie: sessionCookie } },
    );
    expect(response.ok).toBe(true);
    const result = await response.json();
    expect((result as { success: boolean }).success).toBe(true);
  });

  test("should filter by unreadOnly", async () => {
    const response = await api.api.notifications.$get(
      { query: { unreadOnly: "true" } },
      { headers: { cookie: sessionCookie } },
    );
    expect(response.ok).toBe(true);
    const result = await response.json() as { items: unknown[] };
    expect(Array.isArray(result.items)).toBe(true);
  });
});
