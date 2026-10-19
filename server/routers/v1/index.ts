import { Hono } from "hono";

import { NotFoundError } from "@/server/errors/index.ts";
import { apiClientRateLimit, apiKeyMiddleware, apiKeyRateLimit } from "@/server/middlewares/index.ts";

import characters from "./characters/index.ts";
import rulesets from "./rulesets/index.ts";

/**
 * The public API, version 1: what the app does, for a caller outside it, signed in with an API key that acts as its
 * user. Its routes call the app's services, and answer in v1's own shapes (`V1`), which stay fixed while the app's own
 * API changes with its screens.
 */
export default new Hono()
  .use(apiClientRateLimit)
  .use(apiKeyMiddleware)
  .use(apiKeyRateLimit)
  .route("/characters", characters)
  .route("/rulesets", rulesets)
  // A path no route answers: the API's error, never the app's page, which the static router would serve
  .all("*", () => {
    throw new NotFoundError("The public API has no such route");
  });
