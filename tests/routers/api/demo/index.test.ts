import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { testClient } from "hono/testing";
import { describe, expect, test } from "bun:test";

describe("demo router", () => {
  const api = testClient<Application>(application);

  test("POST /api/demo/start mints a demo user and 201s", async () => {
    const response = await api.api.demo.start.$post();
    expect(response.status).toBe(201);
    const user = await response.json() as { emailAddress: string; expiresAt: string | null };
    expect(user.emailAddress).toMatch(/^demo-[0-9a-f-]+@demo\.invalid$/);
    expect(user.expiresAt).not.toBeNull();
    // Cookie issued so the same browser keeps the session.
    expect(response.headers.get("set-cookie") ?? "").toMatch(/session-id=/);
  });

  test("POST /api/demo/start with a valid demo cookie reuses the session and 200s", async () => {
    const first = await api.api.demo.start.$post();
    const cookie = (first.headers.get("set-cookie") ?? "").split(";")[0];
    expect(cookie).toMatch(/^session-id=/);

    const second = await api.api.demo.start.$post(
      undefined,
      { headers: { cookie } },
    );
    expect(second.status).toBe(200);
    const firstUser = await first.json() as { id: string };
    const secondUser = await second.json() as { id: string };
    expect(secondUser.id).toBe(firstUser.id);
  });

  test("a demo user can't trigger an email-change verification email", async () => {
    const start = await api.api.demo.start.$post();
    const cookie = (start.headers.get("set-cookie") ?? "").split(";")[0];

    const blocked = await api.auth.profile.$put(
      { json: { emailAddress: "attacker@example.com" } },
      { headers: { cookie } },
    );
    expect(blocked.status).toBe(403);
  });

  test("a demo user can't call /auth/delete-account (would orphan rulesets)", async () => {
    const start = await api.api.demo.start.$post();
    const cookie = (start.headers.get("set-cookie") ?? "").split(";")[0];

    const blocked = await api.auth["delete-account"].$post(
      { json: { password: "doesnt-matter" } },
      { headers: { cookie } },
    );
    expect(blocked.status).toBe(403);
  });

  test("a demo user can't create a campaign (would orphan players row)", async () => {
    const start = await api.api.demo.start.$post();
    const cookie = (start.headers.get("set-cookie") ?? "").split(";")[0];

    const blocked = await api.api.campaigns.$post(
      { json: { name: "demo campaign", description: "test", rulesetId: "00000000-0000-0000-0000-000000000000" } },
      { headers: { cookie } },
    );
    expect(blocked.status).toBe(403);
  });
});
