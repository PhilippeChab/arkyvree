import { Hono } from "hono";

import { NotFoundError } from "@/server/errors/index.ts";
import { apiKeyMiddleware, apiKeyRateLimit } from "@/server/middlewares/index.ts";

import activities from "./activities/index.ts";
import attachments from "./attachments/index.ts";
import campaignInvites from "./campaignInvites/index.ts";
import campaigns from "./campaigns/index.ts";
import characterInvites from "./characterInvites/index.ts";
import characters from "./characters/index.ts";
import exports from "./exports/index.ts";
import notifications from "./notifications/index.ts";
import rulesetInvites from "./rulesetInvites/index.ts";
import rulesets from "./rulesets/index.ts";
import sharedCharacters from "./sharedCharacters/index.ts";

/**
 * The public API, version 1: what the app does, for a caller outside it, signed in with an API key that acts as its
 * user. Its routes call the app's services, and answer in v1's own shapes (`V1`), which stay fixed while the app's own
 * API changes with its screens.
 */
export default new Hono()
  .use(apiKeyMiddleware)
  .use(apiKeyRateLimit)
  .route("/activities", activities)
  .route("/attachments", attachments)
  .route("/campaign-invites", campaignInvites)
  .route("/campaigns", campaigns)
  .route("/character-invites", characterInvites)
  .route("/characters", characters)
  .route("/exports", exports)
  .route("/notifications", notifications)
  .route("/ruleset-invites", rulesetInvites)
  .route("/rulesets", rulesets)
  .route("/shared-characters", sharedCharacters)
  // A path no route answers: the API's error, never the app's page, which the static router would serve
  .all("*", () => {
    throw new NotFoundError("The public API has no such route");
  });
