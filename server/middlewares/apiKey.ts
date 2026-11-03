import { createMiddleware } from "hono/factory";

import { hashApiKeyToken, readApiKeyToken } from "@/server/apiKeyTokens.ts";
import { db, withWrite } from "@/server/database/index.ts";
import { UnauthorizedError } from "@/server/errors/index.ts";
import { ApiKeys } from "@/server/repositories/index.ts";
import type { Session } from "@/shared/relations.ts";

/**
 * What the public API's routes read of their request: the user its key acts as, and whether it only reads
 * (`readOnly`), which refuses every route but those that read (`describeRoute`).
 */
export interface ApiKeyContext {
  Variables: {
    readOnly: boolean;
    requestSession: Session;
  };
}

/** How long a key's last use stands before a request marks it again: a key's every request needn't write it. */
const LAST_USED_PRECISION_MS = 60 * 1000;

/**
 * Whom a key's token signs in, and whether it reads alone: none when it's revoked, expired, or its user is gone (an
 * archived account, a demo). Marks the key used, at most once a minute. The MCP server signs in with it too
 * (`mcpSignIn`).
 */
export async function findKeySignIn(token: string) {
  const key = await ApiKeys.findOneWithUser(db, { digest: hashApiKeyToken(token) });
  if (!key || key.userExpiresAt) return undefined;
  const since = Date.now() - LAST_USED_PRECISION_MS;
  if (!key.lastUsedAt || new Date(key.lastUsedAt).getTime() < since)
    await withWrite(async (tx) => ApiKeys.markUsed(tx, { id: key.id, since: new Date(since).toISOString() }));
  return { readOnly: key.readOnly, userId: key.userId };
}

/**
 * The public API's sign-in: the request's key, which acts as its user. Refused when it sends none, or one that's revoked
 * or whose user is gone, a demo's included.
 */
export default createMiddleware<ApiKeyContext>(async (c, next) => {
  const token = readApiKeyToken(c.req.header("authorization"));
  if (!token) throw new UnauthorizedError("Send an API key: `Authorization: Bearer <key>`");
  const signIn = await findKeySignIn(token);
  if (!signIn) throw new UnauthorizedError("Invalid API key");
  c.set("requestSession", { userId: signIn.userId });
  c.set("readOnly", signIn.readOnly);
  await next();
});
