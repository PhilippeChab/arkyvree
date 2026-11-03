import type { JobHelpers } from "graphile-worker";

import { db, withWrite } from "@/server/database/index.ts";
import {
  Activities,
  ApiKeys,
  EmailVerifications,
  Exports,
  Notifications,
  OAuthAuthorizations,
  OAuthGrants,
  OAuthTokens,
  PasswordResets,
  Sessions,
  Users,
} from "@/server/repositories/index.ts";
import { withAccountDeletion } from "@/server/services/writes/index.ts";

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
      run: () => withWrite((tx) => EmailVerifications.delete(tx, { expiresBefore: now })),
    },
    {
      name: "password_resets",
      run: () => withWrite((tx) => PasswordResets.delete(tx, { expiresBefore: now })),
    },
    {
      name: "sessions",
      run: () => withWrite((tx) => Sessions.delete(tx, { expiredOrArchivedBefore: now })),
    },
    {
      name: "api_keys",
      run: async () => ({
        rowCount: (await withWrite((tx) => ApiKeys.delete(tx, { expiresBefore: now }))).length,
      }),
    },
    {
      name: "oauth_authorizations",
      run: async () => ({
        rowCount: (await withWrite((tx) => OAuthAuthorizations.delete(tx, { expiresBefore: now }))).length,
      }),
    },
    {
      name: "oauth_tokens",
      run: async () => ({
        rowCount: (await withWrite((tx) => OAuthTokens.delete(tx, { refreshExpiresBefore: now }))).length,
      }),
    },
    {
      // After the tokens: a connected app whose every refresh token expired is disconnected
      name: "oauth_grants",
      run: async () => ({
        rowCount: (await withWrite((tx) => OAuthGrants.delete(tx, { withoutTokens: true }))).length,
      }),
    },
    {
      name: "exports",
      run: () => withWrite((tx) => Exports.delete(tx, { expiresBefore: now })),
    },
    {
      // Demo users have a 1h TTL on users.expires_at. Hard-delete past-expiry rows so CASCADE wipes their
      // characters/forks/sessions/activities/etc., and the database their attachments and customizations: everything
      // they own locked first, as an account's deletion locks it
      name: "demo_users",
      run: async () => {
        const ids = await Users.findIds(db, { expiredDemosBefore: now });
        return await withAccountDeletion(ids, (tx) => Users.delete(tx, { expiredDemosBefore: now, ids }));
      },
    },
    {
      name: "notifications",
      run: () => withWrite((tx) => Notifications.delete(tx, { createdBefore: cutoff })),
    },
    {
      name: "activities",
      run: () => withWrite((tx) => Activities.delete(tx, { createdBefore: cutoff })),
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
