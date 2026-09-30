import type { Task } from "graphile-worker";
import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";

import { renderEmail, type EmailJobPayload } from "@/server/emails/templates.ts";

type SendEmailPayload = {
  to: string[];
  from: string;
  subject: string;
} & EmailJobPayload;

const env = process.env.NODE_ENV;
const isProduction = env === "production";

let resend: Resend | null = null;
let smtpTransport: Transporter | null = null;

if (isProduction) {
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) resend = new Resend(apiKey);
} else if (env !== "test") {
  const smtpHost = process.env.SMTP_HOST;
  if (smtpHost) {
    smtpTransport = nodemailer.createTransport({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT) || 1025,
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
    if (isProduction) {
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
