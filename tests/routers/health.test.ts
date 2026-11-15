import { describe, expect, test } from "bun:test";

import { application } from "@/server/routers/application.ts";

describe("the probes", () => {
  test.each(["/health", "/up"])("%s answers the app is up and reaches its database", async (path) => {
    const response = await application.request(path);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
