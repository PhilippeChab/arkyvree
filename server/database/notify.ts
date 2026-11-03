import { sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";

/** Sends `payload` on a Postgres channel, to every process listening on it (`LISTEN`). */
export async function notifyChannel(db: Db, channel: string, payload: string) {
  await db.execute(sql`SELECT pg_notify(${channel}, ${payload})`);
}
