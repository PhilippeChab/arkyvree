import { db } from "@/server/database/index.ts";
import { Activities } from "@/server/repositories/index.ts";

/** The types of `userId`'s activities on the target `targetId` of `targetType` (`TARGET_TYPES`'), sorted. */
export async function activityTypes(userId: string, targetType: string, targetId: string) {
  const { items } = await Activities.findPage(db, { userId, targetType }, { limit: 100, page: 1 });
  return items
    .filter((a) => a.targetId === targetId)
    .map((a) => a.type)
    .sort();
}
