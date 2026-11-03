import type { CallToolResult } from "@modelcontextprotocol/server";
import { getPath } from "hono/utils/url";

import v1Calls from "@/server/routers/mcp/v1Calls.ts";
import type { Session } from "@/shared/relations.ts";

/**
 * Who a tool calls the routes for: the user the MCP server's sign-in found, whether their key only reads (`readOnly`:
 * the routes refuse it a change, and the tools that change aren't offered), and the address their request came from
 * (its `X-Forwarded-For`, `X-Real-IP`), which the routes that count per address (an import) count it by, as they count
 * a key's call to `/v1`.
 */
export interface Caller {
  addresses: Record<string, string>;
  readOnly: boolean;
  session: Session;
}

/** A query's values, as a tool takes them: a list's sent as the key repeated. */
export type QueryValues = Record<string, (number | string)[] | boolean | number | string>;

/** The prefix every route's path starts with, which a tool's path may leave out. */
const PREFIX = "/v1";

/**
 * The path a call's URL reaches, as the router reads it (its percent-encoded letters decoded: `%63reation` is
 * `creation`): the one a tool checks its route by.
 */
export function toRoutedPath(url: URL) {
  return getPath(new Request(url));
}

/** A tool's result in its words alone: a refusal of its own (`isError`), or what it did. */
export function toText(text: string, isError = false): CallToolResult {
  return { content: [{ text, type: "text" }], ...(isError && { isError: true }) };
}

/**
 * The URL a tool's path and query name under `/v1`, its prefix added when it has none: none when the path isn't one as
 * a URL reads it (a `..` it resolves, a `\` it turns to `/`, a `#` it cuts), so that the route a tool checks is the one
 * its call reaches.
 */
export function toV1Url(path: string, query: QueryValues = {}) {
  const [bare = ""] = path.split("?");
  const prefixed = bare.startsWith(`${PREFIX}/`) ? bare : `${PREFIX}${bare.startsWith("/") ? "" : "/"}${bare}`;
  const url = new URL(`${prefixed}${path.slice(bare.length)}`, "http://mcp");
  if (url.pathname !== prefixed) return undefined;
  for (const [key, value] of Object.entries(query))
    for (const entry of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(entry));
  return url;
}

/** A route's answer to the caller's user, as the public API answers it: the routes' own checks, shapes and errors. */
export async function requestV1({ addresses, readOnly, session }: Caller, method: string, url: URL, body?: unknown) {
  const headers = { ...addresses, ...(body !== undefined && { "content-type": "application/json" }) };
  const init: RequestInit = { headers, method, ...(body !== undefined && { body: JSON.stringify(body) }) };
  return await v1Calls.request(`${url.pathname}${url.search}`, init, { readOnly, session });
}

/**
 * A route's answer as a tool's result: its JSON as the public API answers it, or an error as the app words it (its
 * status, message and the rules' issues, each naming the entity it's on), which the agent reads to fix its call.
 */
export async function toToolResult(response: Response): Promise<CallToolResult> {
  if (response.status === 204) return toText("Done: the route answers nothing (204)");
  if (!response.headers.get("content-type")?.includes("json"))
    return toText(`${response.status}: ${await response.text()}`, !response.ok);
  const answer: unknown = await response.json();
  if (response.ok) return toText(JSON.stringify(answer));
  return toText(JSON.stringify({ status: response.status, ...(answer as object) }), true);
}
