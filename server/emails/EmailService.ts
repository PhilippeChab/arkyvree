import { sql } from "drizzle-orm";

import { db } from "@/server/database/index.ts";
import { pingWorker } from "@/server/queue.ts";
import type { EmailJobPayload } from "./templates.ts";

type SendArgs = {
  to: string | string[];
  subject: string;
  from?: string;
} & EmailJobPayload;

export class EmailService {
  async send(options: SendArgs): Promise<{ success: boolean; error?: string }> {
    if (process.env.NODE_ENV === "test") {
      return { success: false, error: "Email service not configured" };
    }

    try {
      const from = options.from || "Arkyvree <notifications@arkyvree.com>";
      const to = (Array.isArray(options.to) ? options.to : [options.to])
        .filter((addr) => !addr.endsWith("@demo.invalid"));
      // Demo users have synthetic @demo.invalid addresses. Drop them before
      // queuing — undeliverable bounces would burn sender reputation.
      if (to.length === 0) return { success: true };

      await db.execute(
        sql`SELECT graphile_worker.add_job(
          'sendEmail',
          ${JSON.stringify({
            to,
            from,
            subject: options.subject,
            template: options.template,
            props: options.props,
          })}::json,
          max_attempts := 5
        )`,
      );

      pingWorker();

      return { success: true };
    } catch (error) {
      console.error("[email] Failed to enqueue:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

export const emailService = new EmailService();
