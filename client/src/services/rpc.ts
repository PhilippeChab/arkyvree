import { hc } from "hono/client";

import { ApiError, type ApiValidationIssue } from "@/client/src/services/apiError.ts";
import { apiFetch } from "@/client/src/services/apiFetch.ts";
import type { Application } from "@/server/routers/application.ts";

export type RPC = typeof _rpc;

// Same-origin in all environments — vite's dev proxy forwards
// /api/* and /auth/* to API_PORT, and the SSR server serves them
// directly in production. Hardcoding `localhost:8000` in dev meant
// e2e tests on CI (where nothing is listening on 8000) silently
// failed sign-in because requests bypassed the configured proxy.
const host = document.location.origin;

// We need to do this in order for tsserver to be usuable
const _rpc = hc<Application>("");

export const rpc: RPC = hc<Application>(`${host}/`, { fetch: apiFetch });

export { ApiError, type ApiValidationIssue };

/**
 * Parse an RPC response as its success body type. Non-2xx responses never
 * reach callers — `defaultFetch` has already thrown `ApiError` — so there is
 * no `response.ok` check to write: `queryFn: () => parseResponse(rpc.api.x.$get())`.
 */
export { parseResponse } from "hono/client";
