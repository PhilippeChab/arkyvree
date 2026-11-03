import { Hono } from "hono";

import { NotFoundError } from "@/server/errors/index.ts";
import type { ApiKeyContext } from "@/server/middlewares/index.ts";

import activities from "./activities/index.ts";
import attachments from "./attachments/index.ts";
import campaignInvites from "./campaignInvites/index.ts";
import campaigns from "./campaigns/index.ts";
import characterInvites from "./characterInvites/index.ts";
import characters from "./characters/index.ts";
import exports from "./exports/index.ts";
import notifications from "./notifications/index.ts";
import rules from "./rules/index.ts";
import rulesetInvites from "./rulesetInvites/index.ts";
import rulesets from "./rulesets/index.ts";
import sharedCharacters from "./sharedCharacters/index.ts";

/**
 * The public API's routes, version 1, for the user a sign-in in front of them found (`requestSession`): its key's
 * (`./index.ts`), or the MCP server's credential, whose tools call them (`server/routers/mcp/`).
 */
export default new Hono<ApiKeyContext>()
  .route("/activities", activities)
  .route("/attachments", attachments)
  .route("/campaign-invites", campaignInvites)
  .route("/campaigns", campaigns)
  .route("/character-invites", characterInvites)
  .route("/characters", characters)
  .route("/exports", exports)
  .route("/notifications", notifications)
  .route("/rules", rules)
  .route("/rulesets", rulesets)
  .route("/ruleset-invites", rulesetInvites)
  .route("/shared-characters", sharedCharacters)
  // A path no route answers: the API's error, never the app's page, which the static router would serve
  .all("*", () => {
    throw new NotFoundError("The public API has no such route");
  });
