import { describe, expect, test } from "bun:test";

import { Engine } from "@/engine/index.ts";
import { application } from "@/server/routers/application.ts";

/** What a path's parameter stands for in a request: an id, or a file a regex parameter accepts. */
const PARAM_VALUES = ["00000000-0000-4000-8000-000000000000", "file.js"];

/**
 * A route of a ruleset's own, at its first segment past the ruleset (`skills`): its list or create, an entity of it
 * (`:skillId`) or an action on it (`grouped`), and an entity's copies (`:itemId/duplicate`, `:itemId/variants`).
 */
const RULESET_ROUTE = /^\/api\/rulesets\/:[^/]+\/([^/]+)(?:\/[^/]+)?(?:\/(?:duplicate|variants))?$/;

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

  // A kind's entities are listed, created, read, updated, deleted, grouped and copied through the routes by kind
  // (`/rulesets/:id/entities/:entityType`) alone, whatever kinds a module adds: a route of a kind's own would be a
  // client's to call by its type. A kind's own resources sit past its entity (a class's levels).
  test("no route of a kind's own serves its entities: the routes by kind do", () => {
    const segments = new Set(
      Object.values(Engine.rules().describeAll()).flatMap(({ kinds }) => kinds.map(({ type }) => type)),
    );
    // A route is listed once by each of its handlers (its validators')
    const ownRoutes = new Set(
      application.routes
        .filter(({ path }) => segments.has(RULESET_ROUTE.exec(path)?.[1] ?? ""))
        .map(({ method, path }) => `${method} ${path}`),
    );
    // The kinds came through, and each kind's own route, list or entity, would be caught
    expect(segments.size).toBeGreaterThan(0);
    for (const segment of segments) {
      expect(RULESET_ROUTE.exec(`/api/rulesets/:id/${segment}`)?.[1]).toBe(segment);
      expect(RULESET_ROUTE.exec(`/api/rulesets/:id/${segment}/:entityId`)?.[1]).toBe(segment);
    }
    expect([...ownRoutes]).toEqual([]);
  });
});
