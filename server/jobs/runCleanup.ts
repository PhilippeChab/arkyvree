import type { JobHelpers } from "graphile-worker";

import { withTransaction } from "@/server/database/index.ts";
import {
  Activities,
  EmailVerifications,
  Exports,
  Notifications,
  PasswordResets,
  Sessions,
  Users,
} from "@/server/repositories/index.ts";

function retentionCutoff(): string {
  const date = new Date();
  date.setDate(1); // avoid day-of-month rollover
  date.setMonth(date.getMonth() - 3);
  return date.toISOString();
}

export async function runCleanupTask(_payload: unknown, helpers: JobHelpers): Promise<void> {
  const now = new Date().toISOString();
  const cutoff = retentionCutoff();

  const counts: Record<string, number> = {};

  const tasks = [
    {
      name: "email_verifications",
      run: () => withTransaction((tx) => EmailVerifications.delete(tx, { expiresBefore: now })),
    },
    {
      name: "password_resets",
      run: () => withTransaction((tx) => PasswordResets.delete(tx, { expiresBefore: now })),
    },
    {
      name: "sessions",
      run: () => withTransaction((tx) => Sessions.delete(tx, { expiredOrArchivedBefore: now })),
    },
    {
      name: "exports",
      run: () => withTransaction((tx) => Exports.delete(tx, { expiresBefore: now })),
    },
    {
      // Demo users have a 1h TTL on users.expires_at. Hard-delete past-expiry
      // rows so CASCADE wipes their characters/forks/sessions/activities/etc.,
      // and the database their attachments and customizations.
      name: "demo_users",
      run: () => withTransaction((tx) => Users.delete(tx, { expiredDemosBefore: now })),
    },
    {
      name: "notifications",
      run: () => withTransaction((tx) => Notifications.delete(tx, { createdBefore: cutoff })),
    },
    {
      name: "activities",
      run: () => withTransaction((tx) => Activities.delete(tx, { createdBefore: cutoff })),
    },
  ];

  for (const task of tasks) {
    try {
      const result = (await task.run()) as { rowCount?: number | null };
      counts[task.name] = result.rowCount ?? 0;
    } catch (error) {
      helpers.logger.error(`Failed to purge ${task.name}: ${error}`);
      counts[task.name] = 0;
    }
  }

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (total > 0) {
    const summary = Object.entries(counts)
      .map(([name, count]) => `${count} ${name}`)
      .join(", ");
    helpers.logger.info(`Purged: ${summary}`);
  }
}
