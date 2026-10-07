import type { JobHelpers } from "graphile-worker";

import { type EmailJobPayload, renderEmail } from "@/server/emails/index.ts";
import { isProduction } from "@/server/environment.ts";

import { createEmailTransports } from "./emailTransports.ts";

type SendEmailPayload = {
  to: string[];
  from: string;
  subject: string;
} & EmailJobPayload;

const { resend, smtpTransport } = createEmailTransports();

export async function sendEmailTask(payload: unknown, helpers: JobHelpers): Promise<void> {
  const email = payload as SendEmailPayload;
  const { to, from, subject } = email;

  if (!smtpTransport && !resend) {
    if (isProduction()) throw new Error("Email service not configured");

    helpers.logger.warn(`Email service not configured — skipping send to ${to.join(", ")}`);
    return;
  }

  const { html, text } = renderEmail(email);

  if (smtpTransport) {
    await smtpTransport.sendMail({
      from,
      to: to.join(", "),
      subject,
      html,
      text,
    });
    helpers.logger.info(`Email sent via SMTP to ${to.join(", ")}: ${subject}`);
    return;
  }

  const result = await resend!.emails.send({ from, to, subject, html, text });
  if (result.error) throw new Error(result.error.message);

  helpers.logger.info(`Email sent via Resend to ${to.join(", ")}: ${subject}`);
}
