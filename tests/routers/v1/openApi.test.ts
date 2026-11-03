import { describe, expect, test } from "bun:test";

import { application } from "@/server/routers/application.ts";
import v1Router from "@/server/routers/v1/index.ts";

/** Every `$ref` a document's part points to. */
function collectRefs(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectRefs);
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, entry]) =>
    key === "$ref" && typeof entry === "string" ? [entry] : collectRefs(entry),
  );
}

/** The public API's document, as a caller reads it, without a key. */
async function readDocument() {
  const response = await application.request("/v1/openapi.json");
  expect(response.status).toBe(200);
  return (await response.json()) as {
    components: { responses: Record<string, unknown>; schemas: Record<string, unknown> };
    openapi: string;
    paths: Record<string, Record<string, { operationId: string; responses: Record<string, unknown> }>>;
  };
}

describe("v1 openapi.json", () => {
  test("documents every route of the public API, read without a key", async () => {
    const document = await readDocument();
    expect(document.openapi).toBe("3.1.0");
    const documented = Object.entries(document.paths).flatMap(([path, methods]) =>
      Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`),
    );
    const routes = v1Router.routes
      .filter(({ method }) => method !== "ALL")
      .map(({ method, path }) => `${method} /v1${path.replaceAll(/:(\w+)/g, "{$1}")}`);
    expect(documented.sort()).toEqual([...new Set(routes)].sort());
  });

  test("names each answer's schema, and every schema it points to", async () => {
    const document = await readDocument();
    expect(document.paths["/v1/characters/{id}"]?.get?.responses["200"]).toEqual({
      content: { "application/json": { schema: { $ref: "#/components/schemas/Character" } } },
      description: expect.any(String),
    });
    const components: Record<string, Record<string, unknown>> = document.components;
    const unresolved = collectRefs(document).filter((ref) => {
      const [, place = "", name = ""] = ref.match(/^#\/components\/(\w+)\/(\w+)$/) ?? [];
      return !components[place]?.[name];
    });
    expect(unresolved).toEqual([]);
  });

  test("gives every operation an id of its own", async () => {
    const document = await readDocument();
    const ids = Object.values(document.paths).flatMap((methods) => Object.values(methods).map((op) => op.operationId));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
