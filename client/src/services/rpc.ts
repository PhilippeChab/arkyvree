import { hc } from "hono/client";

import { apiFetch } from "@/client/src/services/apiFetch.ts";
import type { Application } from "@/server/routers/application.ts";

export type RPC = typeof _rpc;

/** We need to do this in order for tsserver to be usable */
const _rpc = hc<Application>("");

/**
 * Same-origin in all environments — vite's dev proxy forwards /api/* and /auth/* to API_PORT, and the SSR server serves
 * them directly in production. Hardcoding `localhost:8000` in dev meant e2e tests on CI (where nothing is listening on
 * 8000) silently failed sign-in because requests bypassed the configured proxy.
 */
const host = document.location.origin;

export const rpc: RPC = hc<Application>(`${host}/`, { fetch: apiFetch });
