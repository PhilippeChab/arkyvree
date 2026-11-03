import { generateApiKeyToken } from "@/server/apiKeyTokens.ts";
import { db } from "@/server/database/index.ts";
import { InternalError, NotFoundError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { ApiKeys } from "@/server/repositories/index.ts";
import { withAccountWrite } from "@/server/services/writes/index.ts";
import { MAX_API_KEYS } from "@/shared/apiKeys.ts";
import type { Session } from "@/shared/relations.ts";

/** The API keys a user makes and revokes on their settings page: each acts as them on the public API (`/v1`). */
class ApiKeysService {
  /**
   * A new key named `name`, expiring `expiresInDays` from now (`null`: never), which only reads when it's `readOnly`,
   * with its token: the only time the token is shown, which the database keeps no copy of. Refused past `MAX_API_KEYS`.
   */
  async createKey(session: Session, name: string, expiresInDays: number | null, readOnly = false) {
    const expiresAt =
      expiresInDays === null ? null : new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
    const { digest, prefix, token } = generateApiKeyToken();
    // Its account locked, so two creates count one after the other
    return await withAccountWrite(session.userId, async (tx) => {
      if ((await ApiKeys.count(tx, { userId: session.userId })) >= MAX_API_KEYS)
        throw new UnprocessableEntityError(`A user keeps ${MAX_API_KEYS} API keys at most: revoke one first`);
      const [key] = await ApiKeys.create(tx, { digest, expiresAt, name, prefix, readOnly, userId: session.userId });
      if (!key) throw new InternalError("Failed to create the API key");
      return { ...key, token };
    });
  }

  /** The user's keys, the newest first. */
  async getKeys(session: Session) {
    return await ApiKeys.findMany(db, { userId: session.userId });
  }

  /** Revokes one of the user's keys: it's deleted, and a request with its token is refused from then on. */
  async revokeKey(session: Session, keyId: string) {
    return await withAccountWrite(session.userId, async (tx) => {
      const [key] = await ApiKeys.delete(tx, { id: keyId, userId: session.userId });
      if (!key) throw new NotFoundError("API key not found");
      return key;
    });
  }
}

export default new ApiKeysService();
