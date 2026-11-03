import { describe, expect, test } from "bun:test";

import { application } from "@/server/routers/application.ts";
import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { callTool, callToolRefused, connectMcp } from "@/tests/support/mcp.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { createBaseCharacter } from "@/tests/support/v1.ts";

/** Whether `value` holds `key` at any depth. */
function holdsKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((entry) => holdsKey(entry, key));
  if (typeof value !== "object" || value === null) return false;
  return Object.entries(value).some(([name, entry]) => name === key || holdsKey(entry, key));
}

/** A user, their key's API client, and an MCP client connected with the same key. */
async function connectUser() {
  const { user } = await createTestUser();
  const { api, key } = await createKeyedApi(user.id);
  return { api, mcp: await connectMcp(key.token), user };
}

describe("mcp", () => {
  test("refuses a request without a key, and a page of another site", async () => {
    const { key } = await createKeyedApi();
    const body = JSON.stringify({ id: 1, jsonrpc: "2.0", method: "tools/list" });
    const headers = { accept: "application/json, text/event-stream", "content-type": "application/json" };
    await expectStatus(application.request("/mcp", { body, headers, method: "POST" }), 401);
    const foreign = { ...headers, authorization: `Bearer ${key.token}`, origin: "https://elsewhere.example" };
    await expectStatus(application.request("/mcp", { body, headers: foreign, method: "POST" }), 403);
  });

  test("lists its tools, each marked by what it does, and says how they work together", async () => {
    const { mcp } = await connectUser();
    const { tools } = await mcp.listTools();
    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
    expect(Object.keys(byName).sort()).toEqual([
      "describe_route",
      "read",
      "read_sheet",
      "remove",
      "search_routes",
      "write",
    ]);
    for (const name of ["describe_route", "read", "read_sheet", "search_routes"])
      expect(byName[name]?.annotations).toMatchObject({ readOnlyHint: true });
    expect(byName.write?.annotations).toMatchObject({ destructiveHint: false, readOnlyHint: false });
    expect(byName.remove?.annotations).toMatchObject({ destructiveHint: true, readOnlyHint: false });
    expect(mcp.getInstructions()).toContain("search_routes");
  });

  test("answers a client of the 2026 protocol as one of the 2025 handshake", async () => {
    const { user } = await createTestUser();
    const { key } = await createKeyedApi(user.id);
    const modern = await connectMcp(key.token, { modern: true });
    expect(modern.getProtocolEra()).toBe("modern");
    const legacy = await connectMcp(key.token);
    expect(legacy.getProtocolEra()).toBe("legacy");
    expect((await modern.listTools()).tools).toEqual((await legacy.listTools()).tools);
    const args = { method: "GET", path: "/v1/characters" };
    expect(await callTool(modern, "read", args)).toEqual(await callTool(legacy, "read", args));
  });

  test("finds a route by words, and describes what it takes and answers", async () => {
    const { mcp } = await connectUser();
    const found = JSON.parse(await callTool(mcp, "search_routes", { query: "archives characters" }));
    expect(found).toContainEqual(
      expect.objectContaining({ method: "DELETE", path: "/v1/characters/{id}", tool: "remove" }),
    );

    const described = JSON.parse(await callTool(mcp, "describe_route", { method: "PUT", path: "/v1/characters/{id}" }));
    expect(described).toMatchObject({ method: "PUT", path: "/v1/characters/{id}", status: 200, tool: "write" });
    expect(described.body.properties).toHaveProperty("updatedAt");
    expect(described.response).toEqual({ $ref: "#/components/schemas/Character" });
    expect(described.schemas).toHaveProperty("Character");
  });

  test("reads a route as the public API answers it, its path's prefix and query optional", async () => {
    const { api, mcp, user } = await connectUser();
    await createBaseCharacter(user.id);
    const answered = await expectOk(api.v1.characters.$get({ query: {} }));
    expect(JSON.parse(await callTool(mcp, "read", { method: "GET", path: "/v1/characters" }))).toEqual(answered);
    const page = JSON.parse(await callTool(mcp, "read", { method: "GET", path: "/characters", query: { limit: 1 } }));
    expect(page.items).toEqual(answered.items.slice(0, 1));
  });

  test("changes and removes what the user may, as the public API does", async () => {
    const { mcp, user } = await connectUser();
    const { id } = await createBaseCharacter(user.id);
    const path = `/v1/characters/${id}`;
    const renamed = JSON.parse(await callTool(mcp, "write", { body: { name: "Renamed" }, method: "PUT", path }));
    expect(renamed).toMatchObject({ id, name: "Renamed" });
    expect(await callTool(mcp, "remove", { method: "DELETE", path })).toContain("204");
    expect(JSON.parse(await callTool(mcp, "read", { method: "GET", path }))).toMatchObject({ archived: true });
  });

  test("refuses a route another tool calls, and a path no tool's route answers", async () => {
    const { mcp, user } = await connectUser();
    const { id } = await createBaseCharacter(user.id);
    expect(await callToolRefused(mcp, "write", { method: "PUT", path: "/v1/nothing" })).toContain("No route answers");
    expect(await callToolRefused(mcp, "read", { method: "POST", path: "/v1/characters" })).toContain("`write`");
    expect(
      await callToolRefused(mcp, "write", { method: "POST", path: `/v1/characters/${id}/advancement-plan` }),
    ).toContain("`read`");
    // A path a URL reads otherwise (a `..`, a `\`, a `#`): the route checked would not be the one reached
    const { user: other } = await createTestUser();
    const { id: theirs } = await createBaseCharacter(other.id);
    for (const path of [
      `/v1/characters/${id}\\..\\${theirs}\\contributors\\leave#/advancement-plan`,
      `/v1/characters/${id}/share#/advancement-plan`,
      `/v1/characters/${id}/../${theirs}/advancement-plan`,
      "/v1/characters/{id}/advancement-plan",
    ])
      expect(await callToolRefused(mcp, "read", { method: "POST", path })).toContain("Send the path");
    // An id the router reads as another route's word reads no sheet
    expect(await callToolRefused(mcp, "read_sheet", { characterId: "creation" })).toContain("No character's id");
    // A file's route (a PDF's download) answers no JSON a tool reads
    expect(await callToolRefused(mcp, "read", { method: "GET", path: "/v1/exports/an-export/download" })).toContain(
      "No route answers",
    );
  });

  test("answers an error as the app words it, with its status", async () => {
    const { mcp } = await connectUser();
    const { user: other } = await createTestUser();
    const { id } = await createBaseCharacter(other.id);
    const refusal = JSON.parse(await callToolRefused(mcp, "read", { method: "GET", path: `/v1/characters/${id}` }));
    expect(refusal).toMatchObject({ cause: "notFound", status: 404 });
    expect(refusal.message).toBeString();
  });

  test("reads a sheet briefly, a section at a time, or whole", async () => {
    const { api, mcp, user } = await connectUser();
    const { id } = await createBaseCharacter(user.id);
    const whole = await expectOk(api.v1.characters[":id"].$get({ param: { id } }));
    const keys = whole.sections.map(({ key }) => key);

    const brief = JSON.parse(await callTool(mcp, "read_sheet", { characterId: id }));
    expect(brief.sections.map(({ key }: { key: string }) => key)).toEqual(keys);
    expect(brief.validation).toEqual(whole.validation);
    expect(holdsKey(brief.sections, "width")).toBe(false);
    expect(JSON.stringify(brief).length).toBeLessThan(JSON.stringify(whole).length);

    const [first] = keys;
    const one = JSON.parse(await callTool(mcp, "read_sheet", { characterId: id, sections: [first] }));
    expect(one.sections.map(({ key }: { key: string }) => key)).toEqual([first]);
    expect(await callToolRefused(mcp, "read_sheet", { characterId: id, sections: ["no-such-section"] })).toContain(
      keys.join(", "),
    );
    expect(JSON.parse(await callTool(mcp, "read_sheet", { characterId: id, full: true }))).toEqual(whole);
  });
});
