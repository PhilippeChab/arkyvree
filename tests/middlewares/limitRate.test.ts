import { describe, expect, test } from "bun:test";

import { Hono, type MiddlewareHandler } from "hono";

import { toJson } from "@/server/errors/index.ts";
import type { ApiKeyContext } from "@/server/middlewares/apiKey.ts";
import { limitRate, limitRatePerKey } from "@/server/middlewares/limitRate.ts";
import { expectStatus } from "@/tests/support/api.ts";

/** An app behind `limiter`, answering errors as the application does. */
function behind(limiter: MiddlewareHandler) {
  return new Hono()
    .use(limiter)
    .all("/", (c) => c.text("ok"))
    .onError((err, c) => {
      const [error, code] = toJson(err);
      return c.json(error, code);
    });
}

function from(ip: string, init: RequestInit = {}) {
  return { ...init, headers: { ...init.headers, "x-forwarded-for": ip } };
}

/** An app behind the per-key limit, its requests' key the `x-key` header's, as the public API's sign-in sets it. */
function limitedPerApiKey() {
  return new Hono<ApiKeyContext>()
    .use(async (c, next) => {
      const id = c.req.header("x-key") ?? "";
      c.set("requestApiKey", { id, userId: id });
      c.set("requestSession", { userId: id });
      await next();
    })
    .use(limitRatePerKey({ windowMs: 60_000, limit: 1 }, true))
    .all("/", (c) => c.text("ok"))
    .onError((err, c) => {
      const [error, code] = toJson(err);
      return c.json(error, code);
    });
}

function limitedPerEmail() {
  return behind(limitRate({ windowMs: 60_000, limit: 1, per: "email" }, true));
}

function limitedPerIp() {
  return behind(limitRate({ windowMs: 60_000, limit: 2 }, true));
}

function withApiKey(keyId: string, ip = "10.0.0.1") {
  return from(ip, { headers: { "x-key": keyId } });
}

function withEmail(emailAddress: unknown) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emailAddress }),
  };
}

describe("limitRate", () => {
  test("is off in the tests, whose requests share an IP", async () => {
    const app = behind(limitRate({ windowMs: 60_000, limit: 1 }));
    for (let i = 0; i < 3; i++) expect((await app.request("/", from("10.0.0.1"))).status).toBe(200);
  });

  describe("per IP", () => {
    test("refuses a client past its limit, with a 429, and counts each client apart", async () => {
      const app = limitedPerIp();
      const first = await app.request("/", from("10.0.0.1"));
      expect(first.status).toBe(200);
      expect(first.headers.get("RateLimit-Limit")).toBe("2");
      expect((await app.request("/", from("10.0.0.1"))).status).toBe(200);

      const refused = await app.request("/", from("10.0.0.1"));
      await expectStatus(refused, 429);
      expect(await refused.json()).toMatchObject({ cause: "tooManyRequests" });
      expect((await app.request("/", from("10.0.0.2"))).status).toBe(200);
    });

    test("takes the client from the first forwarded address, or the real IP header", async () => {
      const app = limitedPerIp();
      await app.request("/", from("10.0.0.3, 172.16.0.1"));
      await app.request("/", from("10.0.0.3, 172.16.0.2"));
      await expectStatus(app.request("/", from("10.0.0.3")), 429);

      await app.request("/", { headers: { "x-real-ip": "10.0.0.4" } });
      await app.request("/", { headers: { "x-real-ip": "10.0.0.4" } });
      await expectStatus(app.request("/", { headers: { "x-real-ip": "10.0.0.4" } }), 429);
      expect((await app.request("/", { headers: { "x-real-ip": "10.0.0.5" } })).status).toBe(200);
    });
  });

  describe("per email address", () => {
    test("refuses an address past its limit, whatever its case, and counts each address apart", async () => {
      const app = limitedPerEmail();
      expect((await app.request("/", withEmail("Ada@example.com"))).status).toBe(200);
      await expectStatus(app.request("/", withEmail("ada@EXAMPLE.com")), 429);
      expect((await app.request("/", withEmail("grace@example.com"))).status).toBe(200);
    });

    test("doesn't count reads, nor requests without an address", async () => {
      const app = limitedPerEmail();
      for (let i = 0; i < 2; i++) {
        expect((await app.request("/")).status).toBe(200);
        expect((await app.request("/", { method: "PUT", body: "not json" })).status).toBe(200);
        expect((await app.request("/", withEmail(42))).status).toBe(200);
      }
    });
  });

  describe("per API key", () => {
    test("refuses a key past its limit from any address, and counts each key apart", async () => {
      const app = limitedPerApiKey();
      expect((await app.request("/", withApiKey("first", "10.0.0.1"))).status).toBe(200);
      await expectStatus(app.request("/", withApiKey("first", "10.0.0.2")), 429);
      expect((await app.request("/", withApiKey("second", "10.0.0.1"))).status).toBe(200);
    });
  });
});
