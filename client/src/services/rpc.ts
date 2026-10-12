import { hc } from "hono/client";

import type { Application } from "@/server/routers/application.ts";

import { apiFetch } from "./apiFetch.ts";

type RPC = typeof _rpc;

/** The client's type, named so `rpc` is annotated with it rather than inferring it again: tsserver stays usable */
const _rpc = hc<Application>("");

/**
 * Same-origin in all environments: vite's dev proxy forwards /api/* and /auth/* to API_PORT, and in production the
 * server that serves the built client serves them too.
 */
const host = document.location.origin;

export const rpc: RPC = hc<Application>(`${host}/`, { fetch: apiFetch });
