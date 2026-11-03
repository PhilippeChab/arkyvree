import { describe, expect, test } from "bun:test";

import { Hono } from "hono";
import { z } from "zod";

import { describeRoute, validate } from "@/server/middlewares/index.ts";
import { buildOpenApiDocument } from "@/server/routers/v1/openApiDocument.ts";

describe("buildOpenApiDocument", () => {
  test("names a schema a request sends apart from the one an answer holds, which a default makes differ", () => {
    const thing = z.object({ size: z.number().default(1) }).meta({ id: "DocumentedThing" });
    const router = new Hono().post(
      "/things",
      describeRoute({ response: thing, status: 201, summary: "Adds a thing" }),
      validate("json", z.object({ thing })),
      (c) => c.json({ size: 1 }, 201),
    );
    const { components, paths } = buildOpenApiDocument(router, "/v1");

    expect(components.schemas).toMatchObject({
      DocumentedThing: { required: ["size"] },
      DocumentedThingInput: { properties: { size: { default: 1 } } },
    });
    expect(components.schemas.DocumentedThingInput).not.toHaveProperty("required");
    expect(paths["/v1/things"]?.post.requestBody?.content["application/json"]?.schema).toMatchObject({
      properties: { thing: { $ref: "#/components/schemas/DocumentedThingInput" } },
    });
  });

  test("refuses a route that doesn't describe itself", () => {
    const router = new Hono().get("/things", (c) => c.json([], 200));
    expect(() => buildOpenApiDocument(router, "/v1")).toThrow("has no description");
  });
});
