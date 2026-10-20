import { describe, expect, test } from "bun:test";

import publishNotified from "@/server/middlewares/publishNotified.ts";
import { application } from "@/server/routers/application.ts";

describe("publishNotified", () => {
  test("runs on the app's API and on the public API, whose writes notify users alike", () => {
    const paths = application.routes.filter(({ handler }) => handler === publishNotified).map(({ path }) => path);
    expect(paths).toEqual(["/api/*", "/v1/*"]);
  });
});
