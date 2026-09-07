import type { Task } from "graphile-worker";

import { db, withTransaction } from "@/server/database/index.ts";
import {
  Activities,
  Characters,
  EmailVerifications,
  Exports,
  Notifications,
  PasswordResets,
  Sessions,
  Users,
} from "@/server/repositories/index.ts";
import { purgeAttachmentsForRecords } from "@/server/services/AttachmentsService.ts";

function retentionCutoff(): string {
  const date = new Date();
  date.setDate(1); // avoid day-of-month rollover
  date.setMonth(date.getMonth() - 3);
  return date.toISOString();
}

export const runCleanupTask: Task = async (_, helpers) => {
  const now = new Date().toISOString();
  const cutoff = retentionCutoff();

  const counts: Record<string, number> = {};

  const tasks = [
    {
      name: "email_verifications",
      run: () => EmailVerifications.delete(db, { expiresBefore: now }),
    },
    {
      name: "password_resets",
      run: () => PasswordResets.delete(db, { expiresBefore: now }),
    },
    {
      name: "sessions",
      run: () => Sessions.delete(db, { expiredOrArchivedBefore: now }),
    },
    {
      name: "exports",
      run: () => Exports.delete(db, { expiresBefore: now }),
    },
    {
      // Demo users have a 1h TTL on users.expires_at. Hard-delete past-expiry
      // rows so CASCADE wipes their characters/forks/sessions/activities/etc.
      // Polymorphic attachments don't cascade, so purge them in the same tx.
      name: "demo_users",
      run: async () => {
        return await withTransaction(async (tx) => {
          const userIds = await Users.findExpiredDemoIds(tx, { expiredDemosBefore: now });
          if (userIds.length === 0) return { rowCount: 0 };
          const characterIds = await Characters.findIdsByUserIds(tx, { userIds });
          await purgeAttachmentsForRecords(tx, "User", userIds);
          await purgeAttachmentsForRecords(tx, "Character", characterIds);
          const result = await Users.delete(tx, { expiredDemosBefore: now }) as { rowCount?: number | null };
          return { rowCount: result.rowCount ?? userIds.length };
        });
      },
    },
    {
      name: "notifications",
      run: () => Notifications.delete(db, { createdBefore: cutoff }),
    },
    {
      name: "activities",
      run: () => Activities.delete(db, { createdBefore: cutoff }),
    },
  ];

  for (const task of tasks) {
    try {
      const result = await task.run() as { rowCount?: number | null };
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
