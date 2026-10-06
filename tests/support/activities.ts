import { getTableName } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import { db } from "@/server/database/index.ts";
import { Activities } from "@/server/repositories/index.ts";

/** The types of `userId`'s activities on the row `targetId` of `table`, sorted. */
export async function activityTypes(userId: string, table: PgTable, targetId: string) {
  const { items } = await Activities.findPage(
    db,
    { userId, targetTable: getTableName(table) },
    { limit: 100, page: 1 },
  );
  return items
    .filter((a) => a.targetId === targetId)
    .map((a) => a.type)
    .sort();
}
