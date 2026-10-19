import { createMiddleware } from "hono/factory";

import { hashApiKeyToken, readApiKeyToken } from "@/server/apiKeyTokens.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { UnauthorizedError } from "@/server/errors/index.ts";
import { ApiKeys } from "@/server/repositories/index.ts";
import type { Session } from "@/shared/relations.ts";

/** What the public API's routes read of their request: the key it's sent with, and the user it acts as. */
export interface ApiKeyContext {
  Variables: {
    requestApiKey: { id: string; userId: string };
    requestSession: Session;
  };
}

/** How long a key's last use stands before a request marks it again: a key's every request needn't write it. */
const LAST_USED_PRECISION_MS = 60 * 1000;

/**
 * The public API's sign-in: the request's key, which acts as its user. Refused when it sends none, or one that's revoked
 * or whose user is gone, a demo's included.
 */
export default createMiddleware<ApiKeyContext>(async (c, next) => {
  const token = readApiKeyToken(c.req.header("authorization"));
  if (!token) throw new UnauthorizedError("Send an API key: `Authorization: Bearer <key>`");

  const key = await ApiKeys.findOneWithUser(db, { digest: hashApiKeyToken(token) });
  if (!key || key.userExpiresAt) throw new UnauthorizedError("Invalid API key");

  const since = Date.now() - LAST_USED_PRECISION_MS;
  if (!key.lastUsedAt || new Date(key.lastUsedAt).getTime() < since)
    await withTransaction(async (tx) => ApiKeys.markUsed(tx, { id: key.id, since: new Date(since).toISOString() }));

  c.set("requestApiKey", { id: key.id, userId: key.userId });
  c.set("requestSession", { userId: key.userId });
  await next();
});
