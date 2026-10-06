import { describe, expect, test } from "bun:test";

import { application } from "@/server/routers/application.ts";

/** What a path's parameter stands for in a request: an id, or a file a regex parameter accepts. */
const PARAM_VALUES = ["00000000-0000-4000-8000-000000000000", "file.js"];

/** A request path for `path`: each parameter a value it accepts, a wildcard any segment. */
function requestPath(path: string) {
  return path
    .replace(/:[A-Za-z0-9_]+(?:\{([^}]*)\})?/g, (_, pattern?: string) => {
      const value = PARAM_VALUES.find((v) => !pattern || new RegExp(`^(?:${pattern})$`).test(v));
      if (!value) throw new Error(`No value in PARAM_VALUES matches \`${pattern}\` (${path})`);
      return value;
    })
    .replace(/\*/g, "x");
}

describe("application", () => {
  // Hono runs the routes a request matches in the order they're registered: a sub-router mounted before its parent's
  // routes, or a parameter before a fixed segment, would answer another route's requests.
  test("every route answers its own requests: none is shadowed by one registered before it", () => {
    const routes = application.routes.filter((route) => route.method !== "ALL");
    const shadowed = [];
    for (const route of routes) {
      const [matches] = application.router.match(route.method, requestPath(route.path));
      const first = matches.map(([[, matched]]) => matched).find((matched) => matched.method !== "ALL");
      if (first?.path !== route.path) shadowed.push(`${route.method} ${route.path} → ${first?.path}`);
    }
    expect(routes.length).toBeGreaterThan(0);
    expect(shadowed).toEqual([]);
  });
});
