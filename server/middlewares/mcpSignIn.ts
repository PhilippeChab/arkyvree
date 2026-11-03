import { createMiddleware } from "hono/factory";

import { hashApiKeyToken, readApiKeyToken } from "@/server/apiKeyTokens.ts";
import { db, withWrite } from "@/server/database/index.ts";
import { readIssuer, toScope } from "@/server/oauthIssuer.ts";
import { OAUTH_TOKEN_STARTS } from "@/server/oauthTokens.ts";
import { OAuthGrants, OAuthTokens } from "@/server/repositories/index.ts";

import { type ApiKeyContext, findKeySignIn } from "./apiKey.ts";

/** How long a connected app's last use stands before a request marks it again. */
const LAST_USED_PRECISION_MS = 60 * 1000;

/**
 * Whom an OAuth access token signs in (`/oauth/token`'s), and whether it reads alone: none when it's expired, its app
 * was disconnected, or its user is gone (an archived account, a demo). Marks its app used, at most once a minute.
 */
async function findTokenSignIn(token: string) {
  const grant = await OAuthTokens.findOneWithUser(db, { accessDigest: hashApiKeyToken(token) });
  if (!grant || grant.userExpiresAt) return undefined;
  const since = Date.now() - LAST_USED_PRECISION_MS;
  if (!grant.lastUsedAt || new Date(grant.lastUsedAt).getTime() < since) {
    await withWrite(async (tx) =>
      OAuthGrants.markUsed(tx, { id: grant.grantId, since: new Date(since).toISOString() }),
    );
  }
  return { readOnly: grant.readOnly, userId: grant.userId };
}

/**
 * The MCP server's sign-in: an OAuth access token (Claude's, ChatGPT's, as their user allowed them on the consent
 * page), or an API key (Claude Code's, a script's), each acting as its user, reading alone when it was made so. Refused
 * with a 401 that names where its sign-in starts (`WWW-Authenticate`, the protected resource's metadata), which an app
 * reads to send its user to sign in. An OAuth token signs in to `/mcp` alone, never `/v1`.
 */
export default createMiddleware<ApiKeyContext>(async (c, next) => {
  const token = readApiKeyToken(c.req.header("authorization"));
  const signIn =
    token && (token.startsWith(OAUTH_TOKEN_STARTS.access) ? await findTokenSignIn(token) : await findKeySignIn(token));
  if (!signIn) {
    const metadata = `${readIssuer()}/.well-known/oauth-protected-resource/mcp`;
    const challenge = `Bearer resource_metadata="${metadata}", scope="${toScope(false)}"`;
    const message = "Sign in: connect the app to Arkyvree, or send an API key (`Authorization: Bearer <key>`)";
    return c.json({ cause: "unauthorized", error: "UnauthorizedError", message }, 401, {
      "WWW-Authenticate": challenge,
    });
  }
  c.set("requestSession", { userId: signIn.userId });
  c.set("readOnly", signIn.readOnly);
  await next();
});
