import { Hono } from "hono";

import { apiAddressRateLimit, apiKeyMiddleware, apiKeyRateLimit } from "@/server/middlewares/index.ts";

import routes from "./routes.ts";

/**
 * The public API, version 1: what the app does, for a caller outside it, signed in with an API key that acts as its
 * user. Its routes call the app's services, and answer in v1's own shapes (`V1`), which stay fixed while the app's own
 * API changes with its screens.
 */
export default new Hono()
  // Counted before the key's lookup, which a wrong key or none would cost uncounted
  .use(apiAddressRateLimit)
  .use(apiKeyMiddleware)
  .use(apiKeyRateLimit)
  .route("/", routes);
