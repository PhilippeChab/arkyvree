/** What the key's user did, as v1 answers it: their activities, each's target named by its kind. */

import type { z } from "zod";

import { toV1Kind } from "@/server/routers/v1/kinds.ts";
import type { v1Activity, v1Target, v1TargetPage } from "@/server/routers/v1/schemas/activities.ts";
import type { ActivitiesService } from "@/server/services/activities/index.ts";
import { isRecord } from "@/shared/isRecord.ts";

/** What a service answers, awaited. */
type Answer<F extends (...args: never[]) => Promise<unknown>> = Awaited<ReturnType<F>>;

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
  targetTable,
}: {
  targetId: string;
  targetTable: string;
}): z.infer<typeof v1Target> {
  return { id: targetId, kind: toV1Kind(targetTable) };
}

/** The app's page that shows a target, a path on its origin. */
export function toV1TargetPage(path: string): z.infer<typeof v1TargetPage> {
  return { path };
}
