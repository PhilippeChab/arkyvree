import { describe, expect, test } from "bun:test";

import { Hono } from "hono";
import { z } from "zod";

import { NotFoundError, toJson } from "@/server/errors/index.ts";
import { describeRoute } from "@/server/middlewares/describeRoute.ts";
import { expectStatus } from "@/tests/support/api.ts";

/** A route that answers `body` with `status`, described as answering a named thing with 200. */
function describedAs(body: unknown, status: 200 | 201 = 200) {
  const description = describeRoute({
    response: z.strictObject({ name: z.string() }),
    status: 200,
    summary: "A named thing",
  });
  return new Hono()
    .get("/", description, (c) => c.json(body, status))
    .get("/missing", description, () => {
      throw new NotFoundError("Nothing here");
    })
    .onError((err, c) => {
      const [error, code] = toJson(err);
      return c.json(error, code);
    });
}

/** A route that answers `body` as `type`, described as answering a PDF with 200. */
function describedAsFile(body: string, type: string) {
  const description = describeRoute({ file: "application/pdf", response: null, status: 200, summary: "A sheet" });
  return new Hono().get("/", description, () => new Response(body, { headers: { "Content-Type": type } }));
}

describe("describeRoute", () => {
  test("carries what its route documents", () => {
    const description = { response: null, status: 204, summary: "Nothing" } as const;
    expect(describeRoute(description).description).toEqual(description);
  });

  test("passes an answer its route describes, and an error through", async () => {
    expect(await (await describedAs({ name: "Dwarf" }).request("/")).json()).toEqual({ name: "Dwarf" });
    await expectStatus(describedAs({ name: "Dwarf" }).request("/missing"), 404);
  });

  test("refuses an answer its route doesn't describe, outside production: its shape, or its status", async () => {
    await expectStatus(describedAs({ name: "Dwarf", createdAt: "2026-01-01" }).request("/"), 500);
    await expectStatus(describedAs({ title: "Dwarf" }).request("/"), 500);
    await expectStatus(describedAs({ name: "Dwarf" }, 201).request("/"), 500);
  });

  test("passes a file of the media type its route describes, and refuses another", async () => {
    const response = await describedAsFile("%PDF-", "application/pdf").request("/");
    expect(await response.text()).toBe("%PDF-");
    await expectStatus(describedAsFile("{}", "application/json").request("/"), 500);
  });
});
