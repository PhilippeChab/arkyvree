/**
 * What an entity's write writes of its joins from it, whichever save writes it: its own form's, or its owner's
 * progression's.
 */

import type { Db } from "@/drizzle/database.ts";
import type { JoinRows } from "@/engine/index.ts";
import { Joins } from "@/server/repositories/index.ts";

/**
 * Writes the rows of an entity's (`fromId`) joins a plan gives (`joins`, by join), each replacing the ones it had: a
 * join it leaves out (`undefined`) keeps its rows.
 */
export async function writeJoins(tx: Db, fromId: string, joins: JoinRows) {
  for (const [join, rows] of Object.entries(joins)) {
    if (rows === undefined) continue;
    await Joins.delete(tx, { join, fromId });
    await Joins.createMany(tx, join, rows, { fromId });
  }
}
