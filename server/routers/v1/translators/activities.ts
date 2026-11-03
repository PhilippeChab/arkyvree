/** What the key's user did, as v1 answers it: their activities, each's target named by its kind. */

import type { z } from "zod";

import type { v1Activity, v1Target } from "@/server/routers/v1/schemas/activities.ts";
import type { ActivitiesService } from "@/server/services/activities/index.ts";
import { isRecord } from "@/shared/isRecord.ts";

import type { Answer } from "./answers.ts";

/** Something the key's user did. */
export function toV1Activity(
  activity: Answer<typeof ActivitiesService.getActivities>["items"][number],
): z.infer<typeof v1Activity> {
  const { createdAt, data, id, type } = activity;
  return { createdAt, data: isRecord(data) ? data : null, id, target: toV1Target(activity), type };
}

/** What an activity or a notification is about, its kind as v1 names it. */
export function toV1Target({
  targetId,
  targetType,
}: {
  targetId: string;
  targetType: string;
}): z.infer<typeof v1Target> {
  return { id: targetId, kind: targetType };
}
