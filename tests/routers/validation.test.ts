import { describe, expect, test } from "bun:test";
import { testClient } from "hono/testing";

import { application } from "@/server/routers/application.ts";

const headers = { cookie: "session-id=00000000-0000-4000-8000-000000000123" };
const api = testClient(application);

describe("request validation", () => {
  test("invalid authentication JSON uses the standard error envelope without echoing credentials", async () => {
    const password = "validation-secret-that-must-not-be-echoed";
    const response = await application.request("/auth/sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailAddress: "not-an-email", password }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({
      error: "BadRequestError",
      cause: "badRequest",
      message: "Request validation failed",
      issues: [{ category: "emailAddress", message: expect.any(String) }],
    });
    expect(JSON.stringify(body)).not.toContain(password);
    expect(body).not.toHaveProperty("data");
  });

  test("invalid route parameters use the same error envelope", async () => {
    const response = await application.request("/api/characters/not-a-uuid", { headers });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "BadRequestError",
      issues: [{ category: "id", message: expect.any(String) }],
    });
  });

  test("invalid query parameters return actionable field issues", async () => {
    const response = await application.request("/api/characters?limit=0&page=invalid", { headers });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "BadRequestError",
      issues: expect.arrayContaining([
        { category: "limit", message: expect.any(String) },
        { category: "page", message: expect.any(String) },
      ]),
    });
  });

  test("valid queries retain coercion, defaults, and inferred success types", async () => {
    const response = await api.api.characters.$get({ query: { limit: "1" } }, { headers });
    expect(response.status).toBe(200);
    const body = await response.json();
    if ("error" in body) throw new Error(body.message);

    expect(body.items).toHaveLength(1);
  });
});

for (const method of ["POST", "PUT"] as const) {
  for (const [segment, body] of [
    ["requirements", { level: "1", target: "abilities.strength.base", value: "13", operator: "invalid" }],
    ["requirements", { level: "1", chainingOperator: "invalid" }],
    ["modifiers", { target: "abilities.strength.misc", value: "2", operator: "invalid" }],
  ] as const) {
    test(`${method} ${segment} rejects invalid operators before a database mutation`, async () => {
      const id = "00000000-0000-4000-8000-000000000001";
      const response = await application.request(
        `/api/rulesets/${id}/customization/feats/${id}/${segment}${method === "PUT" ? `/${id}` : ""}`,
        { method, headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "BadRequestError", issues: expect.any(Array) });
    });
  }
}

test("modifier duplication rejects an invalid operator before a database mutation", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const response = await application.request(`/api/rulesets/${id}/customization/feats/${id}/modifiers/${id}/duplicate`, {
    method: "POST", headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ target: "abilities.strength.misc", value: "2", operator: "invalid" }),
  });
  expect(response.status).toBe(400);
});
