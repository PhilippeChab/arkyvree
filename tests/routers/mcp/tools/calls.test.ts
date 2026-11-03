import { describe, expect, test } from "bun:test";

import { Catalog } from "@/server/routers/mcp/Catalog.ts";
import { toRoutedPath, toV1Url } from "@/server/routers/mcp/tools/calls.ts";

describe("toV1Url", () => {
  test("adds the prefix and the query a path has none of, keeping its own query", () => {
    expect(toV1Url("characters", { ids: ["a", "b"], limit: 2 })?.href).toBe(
      "http://mcp/v1/characters?ids=a&ids=b&limit=2",
    );
    expect(toV1Url("/v1/characters?page=2")?.href).toBe("http://mcp/v1/characters?page=2");
  });

  test("refuses a path a URL reads otherwise: a `..` resolved, a `\\` turned to `/`, a `#` cut", () => {
    for (const path of ["/v1/characters/a/../b", "/v1/characters/a\\b", "/v1/characters/a#/b", "/v1/characters/{id}"])
      expect(toV1Url(path)).toBeUndefined();
  });
});

describe("toRoutedPath", () => {
  test("reads a path as the router does, so the route checked is the one reached", () => {
    const url = toV1Url("/v1/characters/%63reation");
    expect(url && toRoutedPath(url)).toBe("/v1/characters/creation");
    expect(url && Catalog.match("GET", toRoutedPath(url))?.path).toBe("/v1/characters/creation");
  });
});
