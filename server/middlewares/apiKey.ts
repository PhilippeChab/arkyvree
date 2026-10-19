import { createMiddleware } from "hono/factory";

import { hashApiKeyToken } from "@/server/apiKeyTokens.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { UnauthorizedError } from "@/server/errors/index.ts";
import { ApiKeys, Users } from "@/server/repositories/index.ts";
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

/** The token a request sends: `Authorization: Bearer <token>`. */
function readBearerToken(header: string | undefined) {
  return header?.match(/^Bearer\s+(\S+)$/i)?.[1];
}

/**
 * The public API's sign-in: the request's key, which acts as its user. Refused when it sends none, or one that's revoked
 * or whose user is gone, a demo's included.
 */
export default createMiddleware<ApiKeyContext>(async (c, next) => {
  const token = readBearerToken(c.req.header("authorization"));
  if (!token) throw new UnauthorizedError("Send an API key: `Authorization: Bearer <key>`");

  const key = await ApiKeys.findOne(db, { digest: hashApiKeyToken(token) });
  if (!key) throw new UnauthorizedError("Invalid API key");
  const user = await Users.findOne(db, { id: key.userId });
  if (!user || user.expiresAt) throw new UnauthorizedError("Invalid API key");

  const since = new Date(Date.now() - LAST_USED_PRECISION_MS).toISOString();
  await withTransaction(async (tx) => ApiKeys.markUsed(tx, { id: key.id, since }));

  c.set("requestApiKey", { id: key.id, userId: key.userId });
  c.set("requestSession", { userId: key.userId });
  await next();
});
