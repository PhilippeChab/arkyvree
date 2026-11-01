import { Hono } from "hono";

import { NotFoundError } from "@/server/errors/index.ts";
import { apiAddressRateLimit, apiKeyMiddleware, apiKeyRateLimit } from "@/server/middlewares/index.ts";

import characters from "./characters/index.ts";
import rules from "./rules/index.ts";
import rulesets from "./rulesets/index.ts";

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
  .route("/characters", characters)
  .route("/rules", rules)
  .route("/rulesets", rulesets)
  // A path no route answers: the API's error, never the app's page, which the static router would serve
  .all("*", () => {
    throw new NotFoundError("The public API has no such route");
  });
