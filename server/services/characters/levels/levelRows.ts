import type { Db } from "@/drizzle/database.ts";
import type { LevelRows } from "@/engine/index.ts";
import { Picks } from "@/server/repositories/index.ts";

/** Writes a level's rows under it, each step's picks as the engine plans them. */
export async function createLevelRows(tx: Db, characterLevelId: string, rows: LevelRows) {
  for (const [pick, picked] of Object.entries(rows)) {
    await Picks.createMany(
      tx,
      pick,
      picked.map((row: object) => ({ characterLevelId, ...row })),
    );
  }
}
