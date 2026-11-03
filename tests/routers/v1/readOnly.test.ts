import { describe, expect, test } from "bun:test";

import { readRouteEffect, type RouteDescription } from "@/server/middlewares/index.ts";
import { application } from "@/server/routers/application.ts";
import routes from "@/server/routers/v1/routes.ts";
import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { createBaseCharacter } from "@/tests/support/v1.ts";

/** What a read-only key's refusal says, which no other refusal does. */
const READ_ONLY_REFUSAL = "read-only";

describe("v1 read-only keys", () => {
  test("refuses before anything else a route runs: each route's description is its first handler", () => {
    const firsts = new Map<string, boolean>();
    for (const { handler, method, path } of routes.routes) {
      // The routes' one middleware for every method is the 404 of a path none answers
      if (method === "ALL") expect(path).toBe("/*");
      else if (!firsts.has(`${method} ${path}`)) firsts.set(`${method} ${path}`, "description" in handler);
    }
    expect(firsts.size).toBe(126);
    expect([...firsts].filter(([, described]) => !described)).toEqual([]);
  });

  test("refuses every route that does more than read, before it runs, and none that reads", async () => {
    const { user } = await createTestUser();
    const { key } = await createKeyedApi(user.id, { readOnly: true });
    const headers = { authorization: `Bearer ${key.token}`, "content-type": "application/json" };
    const answers = [];
    for (const { handler, method, path } of routes.routes) {
      if (!("description" in handler)) continue;
      const reads = readRouteEffect(method, handler.description as RouteDescription) === "reads";
      const url = `/v1${path.replaceAll(/:\w+/g, NIL_UUID)}`;
      const response = await application.request(url, { body: method === "GET" ? undefined : "{}", headers, method });
      const refused = response.status === 403 && (await response.text()).includes(READ_ONLY_REFUSAL);
      answers.push({ method, path, refused: refused === !reads });
    }
    expect(answers.length).toBe(126);
    expect(answers.filter(({ refused }) => !refused)).toEqual([]);
  });

  test("reads as a key that changes does, and changes nothing", async () => {
    const { user } = await createTestUser();
    const { id } = await createBaseCharacter(user.id);
    const { api: reading, key: readingKey } = await createKeyedApi(user.id, { readOnly: true });
    const { api: full } = await createKeyedApi(user.id);

    const sheet = await expectOk(reading.v1.characters[":id"].$get({ param: { id } }));
    // A HEAD is answered by the GET route, which reads
    const headers = { authorization: `Bearer ${readingKey.token}` };
    await expectStatus(application.request(`/v1/characters/${id}`, { headers, method: "HEAD" }), 200);
    expect(sheet).toEqual(await expectOk(full.v1.characters[":id"].$get({ param: { id } })));
    const refusal = await expectStatus(
      reading.v1.characters[":id"].$put({ json: { name: "Renamed" }, param: { id } }),
      403,
    );
    expect(await refusal.text()).toContain(READ_ONLY_REFUSAL);
    expect((await expectOk(full.v1.characters[":id"].$get({ param: { id } }))).name).toBe(sheet.name);
  });
});
