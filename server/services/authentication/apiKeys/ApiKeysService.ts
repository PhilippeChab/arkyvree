import { generateApiKeyToken } from "@/server/apiKeyTokens.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { InternalError, NotFoundError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { ApiKeys, Users } from "@/server/repositories/index.ts";
import { MAX_API_KEYS } from "@/shared/apiKeys.ts";
import type { Session } from "@/shared/relations.ts";

/** The API keys a user makes and revokes on their settings page: each acts as them on the public API (`/v1`). */
class ApiKeysService {
  /**
   * A new key named `name`, expiring `expiresInDays` from now (`null`: never), with its token: the only time the token
   * is shown, which the database keeps no copy of. Refused past `MAX_API_KEYS`: each key's requests are counted apart.
   */
  async createKey(session: Session, name: string, expiresInDays: number | null) {
    const expiresAt =
      expiresInDays === null ? null : new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
    const { digest, prefix, token } = generateApiKeyToken();
    return await withTransaction(async (tx) => {
      // Locked, so two creates count one after the other
      await Users.lock(tx, { id: session.userId });
      if ((await ApiKeys.count(tx, { userId: session.userId })) >= MAX_API_KEYS)
        throw new UnprocessableEntityError(`A user keeps ${MAX_API_KEYS} API keys at most: revoke one first`);
      const [key] = await ApiKeys.create(tx, { digest, expiresAt, name, prefix, userId: session.userId });
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
    return await withTransaction(async (tx) => {
      const [key] = await ApiKeys.delete(tx, { id: keyId, userId: session.userId });
      if (!key) throw new NotFoundError("API key not found");
      return key;
    });
  }
}

export default new ApiKeysService();
