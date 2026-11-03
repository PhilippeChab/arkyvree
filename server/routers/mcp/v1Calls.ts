import { Hono } from "hono";

import { toErrorResponse } from "@/server/errors/index.ts";
import { type ApiKeyContext, apiKeyRateLimit, wrapNonErrors } from "@/server/middlewares/index.ts";
import routes from "@/server/routers/v1/routes.ts";
import type { Session } from "@/shared/relations.ts";

/** What a tool's call hands the routes: the user the MCP server's sign-in found, and whether its key only reads. */
interface CallBindings {
  Bindings: { readOnly: boolean; session: Session };
}

/**
 * The public API's routes, as the MCP server's tools call them (`requestV1`): for the user its sign-in found, passed with
 * each call (`session`, and `readOnly`, which the routes refuse a change to as `/v1` does), never read from the request. It's mounted nowhere, so no request from outside reaches it.
 * Each call counts toward its user's requests, as a key's call to `/v1` does; its own errors answer as the app's do.
 */
export default new Hono<ApiKeyContext & CallBindings>()
  .use(wrapNonErrors)
  .use(async (c, next) => {
    c.set("requestSession", c.env.session);
    c.set("readOnly", c.env.readOnly);
    await next();
  })
  .use(apiKeyRateLimit)
  .route("/v1", routes)
  .onError(toErrorResponse);
