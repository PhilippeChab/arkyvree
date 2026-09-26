import type { ErrorJson } from "@/server/errors/index.ts";
import type { Application } from "@/server/routers/application.ts";
import { hc } from "hono/client";

// Same-origin in all environments — vite's dev proxy forwards
// /api/* and /auth/* to API_PORT, and the SSR server serves them
// directly in production. Hardcoding `localhost:8000` in dev meant
// e2e tests on CI (where nothing is listening on 8000) silently
// failed sign-in because requests bypassed the configured proxy.
const host = document.location.origin;

export type ApiValidationIssue = NonNullable<ErrorJson["issues"]>[number];

export class ApiError extends Error {
  status: number;
  errorName: string;
  issues?: ApiValidationIssue[];

  constructor(message: string, status: number, errorName: string, issues?: ApiValidationIssue[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errorName = errorName;
    this.issues = issues;
  }
}

// We need to do this in order for tsserver to be usuable
const _rpc = hc<Application>("");
export type RPC = typeof _rpc;

const _rpcWithTypes = (...args: Parameters<typeof hc>): RPC => hc<Application>(...args);

const defaultFetch = async (input: URL | RequestInfo, init?: RequestInit) => {
  const response = await fetch(input, {
    ...init,
    credentials: "include",
  });

  if (!response.ok) {
    // Errors from the API are JSON, but a proxy in front of it (502, 413, …)
    // can answer with HTML. Fall back to a generic message instead of
    // surfacing a JSON parse error.
    const errorData: Partial<ErrorJson> = await response.json().catch(() => ({}));

    throw new ApiError(
      errorData.message || "An unexpected error occurred",
      response.status,
      errorData.error || "UnknownError",
      errorData.issues,
    );
  }

  return response;
};

export const rpc = _rpcWithTypes(`${host}/`, { fetch: defaultFetch });

/**
 * Parse an RPC response as its success body type. Non-2xx responses never
 * reach callers — `defaultFetch` has already thrown `ApiError` — so there is
 * no `response.ok` check to write: `queryFn: () => parseResponse(rpc.api.x.$get())`.
 */
export { parseResponse } from "hono/client";
