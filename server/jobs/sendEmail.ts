import type { Task } from "graphile-worker";
import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";

import { type EmailJobPayload, renderEmail } from "@/server/emails/templates.ts";
import { isProduction, isTest, readEnv } from "@/server/environment.ts";

type SendEmailPayload = {
  to: string[];
  from: string;
  subject: string;
} & EmailJobPayload;

let resend: Resend | null = null;
let smtpTransport: Transporter | null = null;

if (isProduction()) {
  const apiKey = readEnv("RESEND_API_KEY");
  if (apiKey) resend = new Resend(apiKey);
} else if (!isTest()) {
  const smtpHost = readEnv("SMTP_HOST");
  if (smtpHost) {
    smtpTransport = nodemailer.createTransport({
      host: smtpHost,
      port: Number(readEnv("SMTP_PORT")) || 1025,
      secure: false,
    });
  } else {
    console.warn("[email] SMTP_HOST not set — emails will not be sent. Run `bun dev:mail` to start Mailpit.");
  }
}

export const sendEmailTask: Task = async (payload, helpers) => {
  const email = payload as SendEmailPayload;
  const { to, from, subject } = email;

  if (!smtpTransport && !resend) {
    if (isProduction()) {
      throw new Error("Email service not configured");
    }
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
  if (result.error) {
    throw new Error(result.error.message);
  }
  helpers.logger.info(`Email sent via Resend to ${to.join(", ")}: ${subject}`);
};
