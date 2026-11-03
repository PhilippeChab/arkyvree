import { eq } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { oauthClientsInAccount } from "@/drizzle/schema.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

/** The apps that sign in to the MCP server, as their metadata documents describe them, kept as they're fetched. */
class OAuthClientsRepository extends BaseRepository<typeof oauthClientsInAccount> {
  constructor() {
    super(oauthClientsInAccount);
  }

  /** An app by its id, its document's URL: none when it was never fetched. */
  async findOne(db: Db, where: { id: string }) {
    const [client] = await db.select().from(this.table).where(eq(this.table.id, where.id));
    return client;
  }

  /** Keeps an app's document as it's fetched: its name and its redirect URIs, replacing what was kept of it. */
  async upsert(db: Db, values: { fetchedAt: string; id: string; name: string; redirectUris: string[] }) {
    const [client] = await db
      .insert(this.table)
      .values(values)
      .onConflictDoUpdate({
        target: this.table.id,
        set: { ...values, updatedAt: new Date().toISOString() },
      })
      .returning();
    return client;
  }
}

export default OAuthClientsRepository;
