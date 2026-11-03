import { describe, expect, test } from "bun:test";

import { Hono } from "hono";

import { checkCsrf } from "@/server/middlewares/csrf.ts";

/** An app behind the CSRF check, its own origin `https://app.example`, answering every path. */
const app = new Hono().use(checkCsrf("https://app.example", true)).all("*", (c) => c.text("ok"));

/** A write without a body or with a form, as a script sends one: no `Origin`, no `Sec-Fetch-Site`. */
const writes = [
  { method: "DELETE" },
  { method: "POST" },
  { method: "POST", headers: { "content-type": "multipart/form-data; boundary=x" }, body: "--x--" },
];

describe("The CSRF check", () => {
  test("refuses an app write without its origin, a script's or another site's form, and takes its own", async () => {
    for (const init of writes) expect((await app.request("/api/characters/1", init)).status).toBe(403);
    const fromApp = { method: "DELETE", headers: { origin: "https://app.example" } };
    expect((await app.request("/api/characters/1", fromApp)).status).toBe(200);
  });

  test("lets the public API's writes through, which a key signs and a browser never sends on its own", async () => {
    for (const init of writes) expect((await app.request("/v1/characters/1", init)).status).toBe(200);
    expect((await app.request("/v1extra", { method: "DELETE" })).status).toBe(403);
  });
});
