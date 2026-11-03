import { describe, expect, test } from "bun:test";

import { Catalog } from "@/server/routers/mcp/Catalog.ts";
import { openApiDocument } from "@/server/routers/v1/openApi.ts";

describe("Catalog", () => {
  test("names the tool that calls each route by what it does, where its method doesn't say it", () => {
    const toolOf = (method: string, path: string) => Catalog.match(method, path)?.effect;
    expect(toolOf("GET", "/v1/characters/{id}")).toBe("reads");
    expect(toolOf("PUT", "/v1/characters/{id}")).toBe("changes");
    expect(toolOf("DELETE", "/v1/characters/{id}")).toBe("removes");
    // POSTs that save nothing, and POSTs that discard what isn't got back as it was
    expect(toolOf("POST", "/v1/characters/{id}/advancement-plan")).toBe("reads");
    expect(toolOf("POST", "/v1/characters/{id}/advancement-plan/options/{step}")).toBe("reads");
    expect(toolOf("POST", "/v1/rulesets/{id}/customization/target/paths/completions")).toBe("reads");
    expect(toolOf("POST", "/v1/rulesets/{id}/customization/target/paths/validate")).toBe("reads");
    expect(toolOf("POST", "/v1/rulesets/{id}/entities/{kind}/{entityId}/restore")).toBe("removes");
    expect(toolOf("POST", "/v1/characters/{id}/contributors/leave")).toBe("removes");
    expect(toolOf("POST", "/v1/rulesets/{id}/contributors/leave")).toBe("removes");
    expect(toolOf("POST", "/v1/characters/{id}/share")).toBe("removes");
    // Answering an invite, or taking one back, is an answer another invite undoes: a change, which no client warns of
    expect(toolOf("POST", "/v1/campaign-invites/{id}/revoke")).toBe("changes");
    for (const invites of ["campaign-invites", "character-invites", "ruleset-invites"])
      expect(toolOf("POST", `/v1/${invites}/{id}/reject`)).toBe("changes");
  });

  test("names a path's route, a literal segment before a parameter, its prefix and query optional", () => {
    // `/characters/creation` and `/characters/{id}` both answer a GET: the router's literal segment wins
    expect(Catalog.match("GET", "/v1/characters/creation")?.path).toBe("/v1/characters/creation");
    expect(Catalog.match("GET", "/characters/1f0c?limit=1")?.path).toBe("/v1/characters/{id}");
    expect(Catalog.match("GET", "/v1/characters/1f0c/nothing")).toBeUndefined();
  });

  test("calls every route that takes and answers JSON, and none that takes a form or answers a file", () => {
    const operations = Object.entries(openApiDocument.paths).flatMap(([path, methods]) =>
      Object.keys(methods).map((method) => ({ method: method.toUpperCase(), path })),
    );
    const called = operations.filter(({ method, path }) => Catalog.match(method, path)?.path === path);
    expect(called.length).toBeGreaterThan(100);
    expect(Catalog.match("POST", "/v1/attachments")).toBeUndefined();
    expect(Catalog.match("GET", "/v1/exports/{id}/download")).toBeUndefined();
  });
});
