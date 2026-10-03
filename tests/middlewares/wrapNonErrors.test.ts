import { describe, expect, test } from "bun:test";

import { Hono } from "hono";

import { toJson } from "@/server/errors/index.ts";
import { wrapNonErrors } from "@/server/middlewares/index.ts";

/** An app whose route throws `thrown`, answering errors as the application does. */
function throwing(thrown: unknown, middlewares: (typeof wrapNonErrors)[]) {
  const app = new Hono();
  for (const middleware of middlewares) app.use(middleware);
  return app
    .get("/", () => {
      throw thrown;
    })
    .onError((err, c) => {
      const [error, code] = toJson(err);
      return c.json(error, code);
    });
}

describe("wrapNonErrors", () => {
  test("answers a thrown value that isn't an Error with the API's envelope", async () => {
    const response = await throwing("boom", [wrapNonErrors]).request("/");
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: "InternalError", cause: "internal" });
  });

  test("is needed: without it, the value escapes onError", async () => {
    // Hono throws it from `request` itself, synchronously or not.
    await expect(Promise.resolve().then(() => throwing("boom", []).request("/"))).rejects.toBe("boom");
  });
});
