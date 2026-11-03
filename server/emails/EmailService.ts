import { addJob, db } from "@/server/database/index.ts";
import { isTest } from "@/server/environment.ts";
import { pingWorker } from "@/server/queue.ts";

import type { EmailJobPayload } from "./templates.ts";

type SendArgs = {
  from?: string;
  subject: string;
  to: string | string[];
} & EmailJobPayload;

class EmailService {
  async send(options: SendArgs): Promise<{ error?: string; success: boolean }> {
    if (isTest()) return { success: false, error: "Email service not configured" };

    try {
      const from = options.from || "Arkyvree <notifications@arkyvree.com>";
      const to = (Array.isArray(options.to) ? options.to : [options.to]).filter(
        (addr) => !addr.endsWith("@demo.invalid"),
      );
      // Demo users have synthetic @demo.invalid addresses. Drop them before
      // queuing — undeliverable bounces would burn sender reputation.
      if (to.length === 0) return { success: true };

      await addJob(
        db,
        "sendEmail",
        { to, from, subject: options.subject, template: options.template, props: options.props },
        { maxAttempts: 5 },
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

export default new EmailService();
