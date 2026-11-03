import { Hono } from "hono";
import { z } from "zod";

import { toErrorResponse } from "@/server/errors/index.ts";
import { oauthAuthorizeRateLimit, oauthTokenRateLimit, validate } from "@/server/middlewares/index.ts";
import { OAuthError, OAuthService } from "@/server/services/authentication/oauth/index.ts";

/** A parameter an app sends, any of which it may leave out: the endpoint answers a missing one as OAuth does. */
const oauthParameter = z.string().optional();

/**
 * The MCP server's OAuth endpoints, which an app (Claude, ChatGPT) signs its user in with: `authorize` sends the user
 * to the consent page, `token` exchanges its code, then its refresh tokens, `revoke` disconnects it. Their refusals
 * answer as OAuth does (`{ error, error_description }`), which an app reads, not in the app's envelope.
 */
export default new Hono()
  .get(
    "/authorize",
    oauthAuthorizeRateLimit,
    validate(
      "query",
      z.object({
        client_id: oauthParameter,
        code_challenge: oauthParameter,
        code_challenge_method: oauthParameter,
        redirect_uri: oauthParameter,
        resource: oauthParameter,
        response_type: oauthParameter,
        scope: oauthParameter,
        state: oauthParameter,
      }),
    ),
    async (c) => {
      const query = c.req.valid("query");
      return c.redirect(await OAuthService.startAuthorization(query), 302);
    },
  )
  .post(
    "/revoke",
    oauthTokenRateLimit,
    validate("form", z.object({ client_id: oauthParameter, token: oauthParameter })),
    async (c) => {
      const { client_id, token } = c.req.valid("form");
      await OAuthService.revokeToken(token, client_id);
      return c.body(null, 200);
    },
  )
  .post(
    "/token",
    oauthTokenRateLimit,
    validate(
      "form",
      z.object({
        client_id: oauthParameter,
        code: oauthParameter,
        code_verifier: oauthParameter,
        grant_type: oauthParameter,
        redirect_uri: oauthParameter,
        refresh_token: oauthParameter,
        resource: oauthParameter,
      }),
    ),
    async (c) => {
      const { client_id, code, code_verifier, grant_type, redirect_uri, refresh_token, resource } = c.req.valid("form");
      const form = { client_id, code, code_verifier, grant_type, redirect_uri, refresh_token, resource };
      return c.json(await OAuthService.createTokens(form), 200, { "Cache-Control": "no-store" });
    },
  )
  .onError((err, c) => {
    if (!(err instanceof OAuthError)) return toErrorResponse(err, c);
    const body = { error: err.code, error_description: err.description };
    return c.json(body, err.status, { "Cache-Control": "no-store" });
  });
