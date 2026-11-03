import { readRouteEffect, type RouteDescription, type RouteEffect } from "@/server/middlewares/index.ts";
import { openApiDocument } from "@/server/routers/v1/openApi.ts";
import routes from "@/server/routers/v1/routes.ts";

/** A route's operation, as the public API's document describes it. */
type Operation = (typeof openApiDocument.paths)[string][string];

/** A route the MCP server's tools call: its method and path as the document names them, what it does and takes. */
export interface CatalogRoute {
  effect: RouteEffect;
  method: string;
  operation: Operation;
  /** Its path's parameters: a route with fewer is the one a path names, `/characters/import` before `/characters/{id}`. */
  parameterCount: number;
  path: string;
  pattern: RegExp;
}

/** The routes a search answers at most. */
const MAX_FOUND = 30;

/** The prefix every route's path starts with, which a tool's path may leave out. */
const PREFIX = "/v1";

/** The tool that calls a route, by what the route does. */
export const TOOL_OF_EFFECT: Record<RouteEffect, string> = { changes: "write", reads: "read", removes: "remove" };

/** The routes a tool calls, from the public API's document. */
function buildRoutes() {
  const effects = collectEffects();
  return Object.entries(openApiDocument.paths).flatMap(([path, methods]) =>
    Object.entries(methods)
      .filter(([, operation]) => isCallable(operation))
      .map(([lower, operation]): CatalogRoute => {
        const method = lower.toUpperCase();
        const effect = effects.get(`${method} ${path}`);
        if (!effect) throw new Error(`The public API's route ${method} ${path} has no description`);
        const source = path.replaceAll(/[.*+?^$()|[\]\\]/g, "\\$&").replaceAll(/\{\w+\}/g, "[^/]+");
        const parameterCount = path.match(/\{\w+\}/g)?.length ?? 0;
        return { effect, method, operation, parameterCount, path, pattern: new RegExp(`^${source}$`) };
      }),
  );
}

/** What a route does, by its method and its document's path (`GET /v1/characters/{id}`), from its description. */
function collectEffects() {
  const effects = new Map<string, RouteEffect>();
  for (const { handler, method, path } of routes.routes) {
    if (!("description" in handler)) continue;
    const documented = `${PREFIX}${path.replaceAll(/:(\w+)/g, "{$1}")}`;
    effects.set(`${method} ${documented}`, readRouteEffect(method, handler.description as RouteDescription));
  }
  return effects;
}

/** The schemas the document names that `value` refers to, and those they refer to, by their names. */
function collectSchemas(value: unknown, found: Record<string, unknown> = {}) {
  if (typeof value !== "object" || value === null) return found;
  const schemas = openApiDocument.components.schemas as Record<string, unknown>;
  for (const [key, entry] of Object.entries(value)) {
    const name = key === "$ref" && typeof entry === "string" ? entry.split("/").pop() : undefined;
    if (!name) {
      collectSchemas(entry, found);
    } else if (!(name in found)) {
      found[name] = schemas[name];
      collectSchemas(schemas[name], found);
    }
  }
  return found;
}

/** Whether a tool calls a route: one that takes a form (an upload) or answers a file (a PDF) isn't JSON's to call. */
function isCallable(operation: Operation) {
  if (operation.requestBody && !("application/json" in operation.requestBody.content)) return false;
  const success = Object.entries(operation.responses).find(([status]) => status.startsWith("2"))?.[1];
  const content = (success as { content?: Record<string, unknown> } | undefined)?.content;
  return !content || "application/json" in content;
}

/** A word of a search, its plural's `s` left out, so that `characters` finds a `character`. */
function toSearchWord(word: string) {
  return word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word;
}

/**
 * The public API's routes the MCP server's tools call: found by words (`search`), described (`describe`), and the one
 * a path names (`match`). Built from its document (`openApiDocument`), so a new route reaches the tools as it reaches
 * the reference.
 */
export class Catalog {
  private static readonly routes = buildRoutes();

  /** What a route takes and answers: its parameters, its body's and its answer's schemas, and those they name. */
  static describe(route: CatalogRoute) {
    const { operation } = route;
    const body = operation.requestBody?.content["application/json"]?.schema;
    const success = Object.entries(operation.responses).find(([status]) => status.startsWith("2"));
    const answer = (success?.[1] as { content?: Record<string, { schema: unknown }> } | undefined)?.content;
    const response = answer?.["application/json"]?.schema;
    const described = { body, parameters: operation.parameters, response };
    return {
      ...Catalog.summarize(route),
      ...described,
      schemas: collectSchemas(described),
      status: Number(success?.[0]),
    };
  }

  /**
   * The route a call names: its method, and its path's template (`/v1/characters/{id}`) or a path it answers
   * (`/v1/characters/1f0c…`), with or without its prefix and its query. The one with the fewest parameters when several
   * answer it, as the router's literal segments win.
   */
  static match(method: string, path: string) {
    const [bare = ""] = path.split("?");
    const prefixed = bare.startsWith(`${PREFIX}/`) ? bare : `${PREFIX}${bare.startsWith("/") ? "" : "/"}${bare}`;
    return Catalog.routes
      .filter((route) => route.method === method && (route.path === prefixed || route.pattern.test(prefixed)))
      .sort((a, b) => a.parameterCount - b.parameterCount)[0];
  }

  /** The routes whose method, path or summary hold the most of a search's words, those that hold one at least. */
  static search(query: string, limit = 10) {
    const words = query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 1)
      .map(toSearchWord);
    return Catalog.routes
      .map((route) => {
        const text = `${route.method} ${route.path} ${route.operation.summary}`.toLowerCase();
        return { route, score: words.filter((word) => text.includes(word)).length };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.route.path.localeCompare(b.route.path))
      .slice(0, Math.min(limit, MAX_FOUND))
      .map(({ route }) => Catalog.summarize(route));
  }

  /** A route as a search answers it: its method, path, what it does, and the tool that calls it. */
  static summarize({ effect, method, operation, path }: CatalogRoute) {
    return { method, path, summary: operation.summary, tool: TOOL_OF_EFFECT[effect] };
  }
}
