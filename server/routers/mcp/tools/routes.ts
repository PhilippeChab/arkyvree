import type { McpServer, ToolAnnotations } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { RouteEffect } from "@/server/middlewares/index.ts";
import { Catalog, TOOL_OF_EFFECT } from "@/server/routers/mcp/Catalog.ts";

import { type Caller, type QueryValues, requestV1, toRoutedPath, toText, toToolResult, toV1Url } from "./calls.ts";

/** What a tool that calls a route takes: its method, its path, its query and its JSON body. */
interface RouteCall {
  body?: Record<string, unknown>;
  method: string;
  path: string;
  query?: QueryValues;
}

/** A route's JSON body, as a tool takes it. */
const bodyInput = z
  .record(z.string(), z.unknown())
  .optional()
  .describe("Its JSON body, in the schema `describe_route` answers for it");

/** What each tool that calls a route does, by what its routes do: the methods it takes, its words, its hints. */
const CALLERS: Record<
  RouteEffect,
  { annotations: ToolAnnotations; description: string; methods: [string, ...string[]]; title: string }
> = {
  changes: {
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false, readOnlyHint: false },
    description:
      "Calls a route that changes what the user reaches (`tool: write` in `search_routes`): creates, edits, saves. " +
      "An edit sends back the `updatedAt` it read, refused (409) when the record changed since",
    methods: ["POST", "PUT"],
    title: "Change",
  },
  reads: {
    annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false, readOnlyHint: true },
    description:
      "Calls a route that reads, changing nothing (`tool: read` in `search_routes`): a GET, or a POST that " +
      "answers what its body comes to, saving nothing",
    methods: ["GET", "POST"],
    title: "Read",
  },
  removes: {
    annotations: { destructiveHint: true, idempotentHint: false, openWorldHint: false, readOnlyHint: false },
    description:
      "Calls a route that removes something the user won't get back as it was (`tool: remove` in " +
      "`search_routes`): archives, deletes, discards a fork's changes, leaves what they contribute to",
    methods: ["DELETE", "POST"],
    title: "Remove",
  },
};

/** A route's path, as a tool takes it. */
const pathInput = z
  .string()
  .min(1)
  .describe("The route's path, its parameters filled in: `/v1/characters/1f0c…`, as `search_routes` names it");

/** A route's query, as a tool takes it. */
const queryInput = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]))
  .optional()
  .describe("Its query's parameters, by name, as `describe_route` lists them");

/** The tools that find and describe the public API's routes, which change nothing. */
function registerDiscovery(server: McpServer) {
  const annotations = { idempotentHint: true, openWorldHint: false, readOnlyHint: true };
  server.registerTool(
    "search_routes",
    {
      annotations,
      description:
        "Finds the public API's routes by words of what to do (`archive character`, `inventory item`, `entity " +
        "modifiers`): each one's method, path, what it does, and the tool that calls it",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(30).optional().describe("The routes it answers at most: 10 by default"),
        query: z.string().min(1).describe("Words of what to do, or of the route's path"),
      }),
      title: "Search the API's routes",
    },
    ({ limit, query }) => toText(JSON.stringify(Catalog.search(query, limit))),
  );
  server.registerTool(
    "describe_route",
    {
      annotations,
      description:
        "What a route takes and answers: its path's and query's parameters, its JSON body's schema, its answer's " +
        "schema, and the schemas they name (`schemas`)",
      inputSchema: z.object({
        method: z.enum(["DELETE", "GET", "POST", "PUT"]),
        path: z
          .string()
          .min(1)
          .describe("Its path as `search_routes` names it (`/v1/characters/{id}`), or a path it answers"),
      }),
      title: "Describe a route",
    },
    ({ method, path }) => {
      const route = Catalog.match(method, path);
      if (!route) return toText(`No route answers ${method} ${path}: \`search_routes\` finds one`, true);
      return toText(JSON.stringify(Catalog.describe(route)));
    },
  );
}

/**
 * A call's route, refused when its path isn't one as it's sent (`toV1Url`), when no route answers it, or when another
 * tool calls it: the route checked is the one the call reaches, its URL's path as the router reads it.
 */
async function callRoute(caller: Caller, effect: RouteEffect, { body, method, path, query }: RouteCall) {
  const url = toV1Url(path, query);
  if (!url) return toText(`Send the path with its parameters filled in, and no \`..\`, \`\\\` or \`#\`: ${path}`, true);
  const route = Catalog.match(method, toRoutedPath(url));
  if (!route) return toText(`No route answers ${method} ${url.pathname}: \`search_routes\` finds one`, true);
  if (route.effect !== effect)
    return toText(`${method} ${route.path} is called with \`${TOOL_OF_EFFECT[route.effect]}\``, true);
  return await toToolResult(await requestV1(caller, method, url, body));
}

/**
 * The tools over the public API's routes: two that find and describe them, and one that calls them for each of what
 * they do (`CALLERS`), each marked by it, so a client asks before calling the one that removes. A read-only key is
 * offered the one that reads alone.
 */
export function registerRouteTools(server: McpServer, caller: Caller) {
  registerDiscovery(server);
  for (const [effect, { annotations, description, methods, title }] of Object.entries(CALLERS) as [
    RouteEffect,
    (typeof CALLERS)[RouteEffect],
  ][]) {
    if (caller.readOnly && effect !== "reads") continue;
    server.registerTool(
      TOOL_OF_EFFECT[effect],
      {
        annotations,
        description,
        inputSchema: z.object({ body: bodyInput, method: z.enum(methods), path: pathInput, query: queryInput }),
        title,
      },
      async (call) => await callRoute(caller, effect, call),
    );
  }
}
